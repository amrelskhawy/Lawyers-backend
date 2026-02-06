import { google } from "googleapis";
import nodemailer from "nodemailer";
import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { addMinutes, parse, format } from "date-fns";

export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    private calendar: any;
    private transporter: any;

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

        // Initialize Nodemailer
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    async createBooking(payload: any) {
        const { serviceId, date, startTime, clientEmail } = payload;
        const bookingDate = new Date(date);

        // 1. Validate Service
        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");

        // 2. Validate Availability (Re-check to prevent race conditions)
        // Simplification: Check if slot is free logic here or reuse availability engine
        // For MVP, we proceed assuming frontend validated via getAvailability

        const endTime = format(addMinutes(parse(startTime, "HH:mm", bookingDate), 60), "HH:mm"); // Default 60 mins

        // 3. Create Booking in DB (PENDING)
        const booking = await prisma.booking.create({
            data: {
                serviceId,
                clientEmail,
                date: bookingDate,
                startTime,
                endTime,
                status: "PENDING",
            },
            include: { service: true }
        });

        try {
            // 4. Create Google Calendar Event
            const event = await this.createGoogleEvent(booking, service.name);

            // 5. Generate Meet Link & Calendar Link
            const meetLink = event.hangoutLink;
            const calendarUrl = event.htmlLink;

            // 6. Update Booking with Links
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    meetLink,
                    calendarUrl,
                    status: "CONFIRMED", // Auto-confirming for now as per flow
                },
            });

            // 7. Send Email
            await this.sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
            console.error("Booking failed:", error);
            // Rollback or mark as failed if needed, but for now we throw
            throw new AppError("Failed to process booking integrations: " + error.message, 500, "BOOKING_INTEGRATION_FAILED");
        }
    }

    private async createGoogleEvent(booking: any, serviceName: string) {
        // Format date/time for Google API (RFC3339)
        const startDateTime = parse(`${format(booking.date, "yyyy-MM-dd")} ${booking.startTime}`, "yyyy-MM-dd HH:mm", new Date());
        const endDateTime = parse(`${format(booking.date, "yyyy-MM-dd")} ${booking.endTime}`, "yyyy-MM-dd HH:mm", new Date());

        const event = {
            summary: `Booking: ${serviceName}`,
            description: `Client: ${booking.clientEmail}`,
            start: { dateTime: startDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() },
            attendees: [{ email: booking.clientEmail }],
            conferenceData: {
                createRequest: {
                    requestId: booking.id,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
        };

        const response = await this.calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        return response.data;
    }

    private async sendConfirmationEmail(booking: any) {
        const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@lawyers.com',
            to: booking.clientEmail,
            subject: 'Booking Confirmation',
            html: `
                <h1>Booking Confirmed!</h1>
                <p>Service: ${booking.service.name}</p>
                <p>Date: ${format(booking.date, "yyyy-MM-dd")}</p>
                <p>Time: ${booking.startTime} - ${booking.endTime}</p>
                <br/>
                <p><strong>Join Google Meet:</strong> <a href="${booking.meetLink}">${booking.meetLink}</a></p>
                <p><a href="${booking.calendarUrl}">Add to Calendar</a></p>
            `,
        };
        await this.transporter.sendMail(mailOptions);
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

        // If not already integrated with Google (e.g. was pending manual review), do it here.
        // For this flow, we already did it on creation, but this allows manual confirmation if we change logic.
        const updated = await prisma.booking.update({
            where: { id },
            data: { status: "CONFIRMED" }
        });
        return updated;
    }

    async completeBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

        const updated = await prisma.booking.update({
            where: { id },
            data: { status: "COMPLETED" }
        });
        return updated;
    }

    async cancelBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id } });
        if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

        // Ideally, delete from Google Calendar here too using the event ID if we stored it.
        // For MVP, we just update DB status.

        const updated = await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" }
        });
        return updated;
    }
}
