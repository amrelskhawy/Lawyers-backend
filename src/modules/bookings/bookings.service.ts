import { google } from "googleapis";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { addMinutes, parse, format, startOfDay, isToday, isBefore } from "date-fns";
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
        const { serviceId, date, startTime, endTime: providedEndTime, clientEmail } = payload;
        const bookingDate = new Date(date);

        // Validate date
        if (isNaN(bookingDate.getTime())) {
            throw new AppResponse(false, "INVALID_DATE", null, 400);
        }

        // Check if date is in the past
        const today = startOfDay(new Date());
        const bookingDay = startOfDay(bookingDate);

        if (isBefore(bookingDay, today)) {
            throw new AppResponse(false, "DATE_IN_PAST", null, 400);
        }

        // 1. Validate Service
        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);

        // Parse startTime - handle both "HH:mm" and "HH:mm:ss.SSS" formats
        let cleanStartTime = startTime;
        if (startTime.includes('.')) {
            cleanStartTime = startTime.split('.')[0];
        }
        if (cleanStartTime.split(':').length > 2) {
            const parts = cleanStartTime.split(':');
            cleanStartTime = `${parts[0]}:${parts[1]}`;
        }

        let cleanEndTime = providedEndTime;
        if (!cleanEndTime) {
            // Default 60 mins if not provided
            cleanEndTime = format(addMinutes(parse(cleanStartTime, "HH:mm", bookingDate), 60), "HH:mm");
        } else {
            // Normalize provided endTime
            if (cleanEndTime.includes('.')) cleanEndTime = cleanEndTime.split('.')[0];
            if (cleanEndTime.split(':').length > 2) {
                const parts = cleanEndTime.split(':');
                cleanEndTime = `${parts[0]}:${parts[1]}`;
            }
        }

        // Ensure endTime is after startTime
        if (cleanEndTime <= cleanStartTime) {
            throw new AppResponse(false, "INVALID_TIME_RANGE", null, 400);
        }

        const endTime = cleanEndTime;

        // Check if booking time is in the past (for today's bookings)
        if (isToday(bookingDate)) {
            const now = new Date();
            const bookingDateTime = parse(cleanStartTime, "HH:mm", bookingDate);
            if (isBefore(bookingDateTime, now)) {
                throw new AppResponse(false, "TIME_IN_PAST", null, 400);
            }
        }

        // 2. Check if day is fully blocked by holiday
        const isFullyBlocked = await this.availabilityEngine.isDayFullyBlocked(bookingDate);
        if (isFullyBlocked) {
            throw new AppResponse(false, "DAY_FULLY_BLOCKED", null, 400);
        }

        // 3. Get working hours (will return defaults if not configured)
        const workingHours = await this.availabilityEngine.getWorkingHours(bookingDate);

        // Check if day is closed (00:00 to 00:00)
        if (workingHours.startTime === "00:00" && workingHours.endTime === "00:00") {
            const dayName = format(bookingDate, "EEEE");
            throw new AppResponse(false, "SERVICE_CLOSED", null, 400);
        }

        // Validate time within working hours
        if (cleanStartTime < workingHours.startTime || endTime > workingHours.endTime) {
            throw new AppResponse(false, "TIME_OUTSIDE_WORKING_HOURS", null, 400);
        }

        // 4. Check if slot is blocked by partial holiday
        const isBlocked = await this.availabilityEngine.isSlotBlocked(bookingDate, cleanStartTime, endTime);
        if (isBlocked) {
            throw new AppResponse(false, "SLOT_BLOCKED", null, 400);
        }

        // 5. Validate Slot Availability (Prevent Double Booking)
        const overlappingBooking = await prisma.booking.findFirst({
            where: {
                date: bookingDay,
                status: { not: "CANCELLED" },
                startTime: { lt: endTime },
                endTime: { gt: cleanStartTime }
            }
        });

        if (overlappingBooking) {
            throw new AppResponse(false, "TIME_SLOT_UNAVAILABLE", null, 409);
        }

        // 6. Create Booking in DB (PENDING)
        const booking = await prisma.booking.create({
            data: {
                serviceId,
                clientEmail,
                date: bookingDay,
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
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

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
            throw new AppResponse(false, "BOOKING_CONFIRMATION_FAILED", null, 500);
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
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        return await prisma.booking.update({
            where: { id },
            data: { status: "COMPLETED" },
            include: { service: true }
        });
    }

    async cancelBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

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
            throw new AppResponse(false, "INVALID_DATE_RANGE", null, 400);
        }

        // 1. Get Working Days configuration (optional - may be empty)
        const workingDays = await prisma.workingDay.findMany({
            orderBy: {
                day: 'asc'
            }
        });

        // 2. Get Holidays in Range
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: startOfDay(startDate),
                    lte: startOfDay(endDate)
                }
            }
        });

        // 3. Get Booked Dates
        const bookings = await prisma.booking.findMany({
            where: {
                date: {
                    gte: startOfDay(startDate),
                    lte: startOfDay(endDate)
                },
                status: {
                    not: "CANCELLED"
                }
            },
            select: {
                date: true
            }
        });

        const bookedDates = Array.from(new Set(bookings.map(b => format(b.date, "yyyy-MM-dd"))));

        return {
            workingDays: workingDays.length > 0 ? workingDays : [{
                day: "DEFAULT",
                isOpen: true,
                startTime: "09:00",
                endTime: "17:00"
            }],
            holidays: holidays.map((h: any) => ({
                date: format(h.date, "yyyy-MM-dd"),
                name: h.name,
                startTime: h.startTime,
                endTime: h.endTime,
                isFullDay: h.isFullDay
            })),
            bookedDates
        };
    }
}