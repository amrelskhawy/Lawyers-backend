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

        // 3. Create Booking in DB (PENDING)
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

        try {
            // 4. Create Google Calendar Event
            const event = await this.createGoogleEvent(booking, service.name);

            // 5. Generate Meet Link & Calendar Link
            const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri || null;
            const calendarUrl = event.htmlLink;

            // 6. Update Booking with Links
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    meetLink,
                    calendarUrl,
                    status: "CONFIRMED",
                },
                include: { service: true } // VITAL: Include service for email context
            });

            // 7. Send Email
            await this.sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
            console.error("Booking integration failed:", error);
            // Return booking even if integration fails, but log error
            return booking;
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
            // Simplified conference data request - let Google pick default
            conferenceData: {
                createRequest: {
                    requestId: booking.id,
                },
            },
        };

        const response = await this.calendar.events.insert({
            calendarId: 'primary',
            requestBody: event, // Use requestBody instead of resource for newer googleapis types
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

    async confirmBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id }, include: { service: true } });
        if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

        if (booking.status === "CONFIRMED") return booking;

        const updated = await prisma.booking.update({
            where: { id },
            data: { status: "CONFIRMED" },
            include: { service: true }
        });

        // Optionally send email here too if confirming manually
        return updated;
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
}
