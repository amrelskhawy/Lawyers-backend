import { google } from "googleapis";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { addMinutes, parse, format, startOfDay, isToday, isBefore } from "date-fns";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { StripeService } from "../payment/providers/stripe/stripe.service.js";

import { PaymentService } from "../payment/payment.service.js";       // ← updated import
import { PaymentFactory } from "../payment/payment.factory.js";       // ← updated import
import { PaymentProvider } from "../payment/payment.interface.js";    // ← updated import


export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    //private stripeService: StripeService;
    private paymentService: PaymentService;
    private calendar: any;
    private meet: any;

    constructor() {
        this.availabilityEngine = new AvailabilityEngine();
        //this.stripeService = new StripeService();
        this.paymentService = new PaymentService();

        const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
        const privateKey = process.env.GOOGLE_PRIVATE_KEY;

        if (clientEmail && privateKey) {
            try {
                const auth = new google.auth.GoogleAuth({
                    credentials: {
                        client_email: clientEmail,
                        private_key: privateKey.replace(/\\n/g, '\n'),
                    },
                    scopes: [
                        'https://www.googleapis.com/auth/calendar',
                        'https://www.googleapis.com/auth/meetings.space.created',
                    ],
                });
                this.calendar = google.calendar({ version: 'v3', auth });
                this.meet = google.meet({ version: 'v2', auth });
            } catch (error) {
                console.error("Failed to initialize Google APIs:", error);
                this.calendar = null;
                this.meet = null;
            }
        } else {
            console.warn("Google credentials missing. Calendar/Meet integration disabled.");
            this.calendar = null;
            this.meet = null;
        }
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

        //const customer = await this.stripeService.createCustomer(clientEmail, payload.name);

        const booking = await prisma.$transaction(async (tx) => {
            const overlappingBooking = await tx.booking.findFirst({
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

            return await tx.booking.create({
                data: {
                    serviceId,
                    clientEmail,
                    name: payload.name,
                    phone_number: payload.phone_number,
                    date: bookingDay,
                    startTime: cleanStartTime,
                    endTime,
                    status: "PENDING",
                    totalAmount: service.price || 0,
                },
                include: { service: true }
            });
        });

        // const payment_link = await this.stripeService.createPaymentLink(
        //     customer.id,
        //     service.price as any,
        //     booking.id
        // );

        // if (!payment_link) {
        //     throw new AppResponse(false, "PAYMENT_LINK_CREATION_FAILED", null, 500);
        // }

        const paymentResult = await this.paymentService.createPayment(booking.id, provider);

        if (!paymentResult?.url) {
            throw new AppResponse(false, "PAYMENT_LINK_CREATION_FAILED", null, 500);
        }

        // Generate Meet link immediately so it's available on the PENDING booking
        let meetLink: string | null = null;
        let calendarUrl: string | null = null;
        try {
            meetLink = await this.createMeetLink();
        } catch (e: any) {
            console.warn("Could not pre-generate Meet link:", e?.message);
        }

        // Persist links on the booking
        const finalBooking = await prisma.booking.update({
            where: { id: booking.id },
            data: { meetLink, calendarUrl },
            include: { service: true },
        });

        return {
            payment_link: paymentResult.url,
            provider: paymentResult.provider,
            ...finalBooking,
        };
    }

    async confirmBooking(id: string) {
        const booking = await prisma.booking.findUnique({ where: { id }, include: { service: true } });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        if (booking.status === "CONFIRMED") return booking;

        //await this.stripeService.captureAndConfirm(booking.paymentIntentId);
        // if (!this.calendar) {
        //     console.error("Google Calendar integration is not initialized.");
        //     throw new AppResponse(false, "CALENDAR_INTEGRATION_DISABLED", null, 503);
        // }

        try {
            // 1. Create Meet link via Meet REST API (best-effort)
            //const meetLink = await this.createMeetLink();

            // 2. Create Google Calendar Event with the Meet link attached
            //const { calendarUrl } = await this.createGoogleEvent(booking, booking.service.name_en, meetLink);

            // 2. Update Booking with Links & Status
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    //meetLink,
                    //calendarUrl,
                    status: "CONFIRMED",
                    paymentStatus: "PAID",
                },
                include: { service: true }
            });

            // 3. Send Confirmation Email
            //await this.sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
            // Surface the real root-cause message for easier debugging
            const msg = error?.cause?.message ?? error?.response?.data?.error?.message ?? error?.message ?? "Unknown error";
            console.error("Booking confirmation failed:", msg);
            throw new AppResponse(false, "BOOKING_CONFIRMATION_FAILED", null, 500);
        }
    }

    // Create a Meet space using the Meet REST API (works with service accounts)
    private async createMeetLink(): Promise<string | null> {
        if (!this.meet) return null;
        try {
            const space = await this.meet.spaces.create({ requestBody: {} });
            const uri = space.data?.meetingUri ?? null;
            if (uri) console.log(`Google Meet link created: ${uri}`);
            return uri;
        } catch (err: any) {
            console.warn('Could not create Meet space:', err?.message ?? err);
            return null;
        }
    }

    private async createGoogleEvent(
        booking: any,
        serviceName: string,
        meetLink: string | null = null
    ): Promise<{ calendarUrl: string | null }> {
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

        const eventBody: any = {
            summary: `Booking: ${serviceName}`,
            description: `Client: ${booking.clientEmail}`,
            start: { dateTime: startDateTime.toISOString(), timeZone: 'UTC' },
            end: { dateTime: endDateTime.toISOString(), timeZone: 'UTC' },
        };

        // Attach the Meet link as a virtual conference entry if provided
        if (meetLink) {
            eventBody.conferenceData = {
                conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
                entryPoints: [{
                    entryPointType: 'video',
                    uri: meetLink,
                    label: meetLink.replace('https://', ''),
                }],
            };
        }

        const response = await this.calendar.events.insert({
            calendarId: 'primary',
            conferenceDataVersion: meetLink ? 1 : 0,
            requestBody: eventBody,
        });

        return { calendarUrl: response.data.htmlLink ?? null };
    }

    private async sendConfirmationEmail(booking: any) {
        await sendEmailWithTemplate(
            booking.clientEmail,
            "Booking Confirmation",
            "bookingConfirmation",
            {
                serviceName: booking.service.name_en,
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

        if (booking.paymentIntentId) {
            const stripeService = new StripeService();
            //return await stripeService.cancelAndRefund(id);
            return await this.paymentService.cancel(id, provider);
        }

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