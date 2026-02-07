import { google } from "googleapis";
import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { addMinutes, parse, format } from "date-fns";
import { sendEmailWithTemplate } from "../../core/utils/email.js";

export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    private calendar: any;

    constructor() {
        this.availabilityEngine = new AvailabilityEngine();

        // Initialize Google Calendar
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        this.calendar = google.calendar({ version: 'v3', auth });
    }

    async createBooking(payload: any) {
        const { serviceId, date, startTime, clientEmail } = payload;
        const bookingDate = new Date(date);

        // Validate date
        if (isNaN(bookingDate.getTime())) {
            throw new AppError("Invalid date provided", 400, "INVALID_DATE");
        }

        // 1. Validate Service
        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");

        // Parse startTime - handle both "HH:mm" and "HH:mm:ss.SSS" formats
        let cleanStartTime = startTime;
        if (startTime.includes('.')) {
            cleanStartTime = startTime.split('.')[0];
        }
        if (cleanStartTime.split(':').length > 2) {
            const parts = cleanStartTime.split(':');
            cleanStartTime = `${parts[0]}:${parts[1]}`;
        }

        const endTime = format(addMinutes(parse(cleanStartTime, "HH:mm", bookingDate), 60), "HH:mm"); // Default 60 mins

        // 2. Validate Service Availability (Holiday & Working Hours)
        // Check partial/full holiday overlap
        const isBlocked = await this.availabilityEngine.isSlotBlocked(bookingDate, cleanStartTime, endTime);
        if (isBlocked) {
            throw new AppError("Selected time is during a holiday/blocked period", 400, "DATE_IS_BLOCKED");
        }

        const workingHours = await this.availabilityEngine.getWorkingHours(bookingDate);
        if (!workingHours) {
            throw new AppError("Service is closed on this day", 400, "c");
        }

        // Validate time within working hours
        if (cleanStartTime < workingHours.startTime || endTime > workingHours.endTime) {
            throw new AppError("Time slot is outside working hours", 400, "TIME_OUTSIDE_WORKING_HOURS");
        }

        // 3. Validate Slot Availability (Prevent Double Booking)
        const overlappingBooking = await prisma.booking.findFirst({
            where: {
                date: bookingDate,
                status: { not: "CANCELLED" },
                startTime: { lt: endTime },
                endTime: { gt: cleanStartTime }
            }
        });

        if (overlappingBooking) {
            throw new AppError("Time slot is not available", 409, "TIME_SLOT_UNAVAILABLE");
        }

        // 3. Create Booking in DB (PENDING) - No Email/Calendar yet
        const booking = await prisma.booking.create({
            data: {
                serviceId,
                clientEmail,
                date: bookingDate,
                startTime: cleanStartTime,
                endTime,
                status: "PENDING",
            },
            include: { service: true }
        });

        return booking;
    }

    async confirmBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id }, include: { service: true } });
        if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

        if (booking.status === "CONFIRMED") return booking;

        try {
            // 1. Create Google Calendar Event
            const event = await this.createGoogleEvent(booking, booking.service.name);

            // 2. Generate Meet Link & Calendar Link
            const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || null;
            const calendarUrl = event.htmlLink;

            // 3. Update Booking with Links & Status
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    meetLink,
                    calendarUrl,
                    status: "CONFIRMED",
                },
                include: { service: true }
            });

            // 4. Send Confirmation Email
            await this.sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
            console.error("Booking confirmation failed:", error);
            throw new AppError("Failed to confirm booking: " + error.message, 500, "BOOKING_CONFIRMATION_FAILED");
        }
    }

    private async createGoogleEvent(booking: any, serviceName: string) {
        const startDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.startTime}`,
            "yyyy-MM-dd HH:mm",
            new Date()
        );
        const endDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.endTime}`,
            "yyyy-MM-dd HH:mm",
            new Date()
        );

        const event = {
            summary: `Booking: ${serviceName}`,
            description: `Client: ${booking.clientEmail}`,
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: 'UTC'
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'UTC'
            },
            // Try 'eventHangout' for consumer accounts
            conferenceData: {
                createRequest: {
                    requestId: booking.id,
                    conferenceSolutionKey: { type: 'eventHangout' },
                },
            },
        };

        const response = await this.calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
            conferenceDataVersion: 1,
        });

        return response.data;
    }

    private async sendConfirmationEmail(booking: any) {
        await sendEmailWithTemplate(
            booking.clientEmail,
            "Booking Confirmation",
            "bookingConfirmation",
            {
                serviceName: booking.service.name,
                date: format(new Date(booking.date), "yyyy-MM-dd"),
                startTime: booking.startTime,
                endTime: booking.endTime,
                meetLink: booking.meetLink || "Link to be sent later",
                calendarUrl: booking.calendarUrl || "#"
            }
        );
    }

    async getAllBookings() {
        return await prisma.booking.findMany({
            include: { service: true },
            orderBy: { date: "desc" },
        });
    }

    async completeBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

        return await prisma.booking.update({
            where: { id },
            data: { status: "COMPLETED" },
            include: { service: true }
        });
    }

    async cancelBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

        return await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true }
        });
    }

    async getBookingMetadata(startDateStr: string, endDateStr: string) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new AppError("Invalid date range", 400, "INVALID_DATE_RANGE");
        }

        // 1. Get Working Days
        const workingDays = await prisma.workingDay.findMany({
            orderBy: {
                day: 'asc'
            }
        });

        // 2. Get Holidays in Range
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        // 3. Get Booked Dates (Dates that have at least one valid booking)
        const bookings = await prisma.booking.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate
                },
                status: {
                    not: "CANCELLED"
                }
            },
            select: {
                date: true
            }
        });

        // Reduce to unique dates
        const bookedDates = Array.from(new Set(bookings.map(b => format(b.date, "yyyy-MM-dd"))));

        return {
            workingDays,
            holidays: holidays.map((h: any) => ({ date: format(h.date, "yyyy-MM-dd"), name: h.name })),
            bookedDates
        };
    }
}
