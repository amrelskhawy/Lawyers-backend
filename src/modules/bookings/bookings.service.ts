import { google } from "googleapis";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { addMinutes, parse, format, startOfDay, isToday, isBefore } from "date-fns";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { PaymentService } from "../payment/payment.service.js";
import { PaymentFactory } from "../payment/payment.factory.js";
import { StripeProvider } from "../payment/providers/stripe/stripe.provider.js";
import { BookingValidator } from "./bookings.validator.js";

export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    private paymentService: PaymentService;
    private calendar: any;
    private meet: any;

    constructor() {
        this.availabilityEngine = new AvailabilityEngine();
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
        const { clientEmail } = payload;

        const { bookingDay, cleanStartTime, endTime, service } =
            await BookingValidator.validateCreateBooking(payload);

        const stripeProvider = PaymentFactory.getProvider("STRIPE") as StripeProvider;

        const customer = await stripeProvider.checkCustomerEmail(clientEmail) || await stripeProvider.createCustomer(clientEmail, payload.name);

        const paymentResult = await this.paymentService.createPayment(
            customer.id,
            service.price as any,
            {
                serviceId: payload.serviceId,
                clientEmail,
                name: payload.name,
                phone: payload.phone_number,
                date: format(bookingDay, "yyyy-MM-dd"),
                startTime: cleanStartTime,
                endTime,
                totalAmount: String(service.price),
            },
            "STRIPE"
        );


        if (!paymentResult || !paymentResult.url) {
            throw new AppResponse(false, "PAYMENT_LINK_CREATION_FAILED", null, 500);
        }

        // No booking saved yet — it gets created in the webhook after payment
        return { payment_link: paymentResult.url };
    }

    async confirmBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);
        if (booking.status === "CONFIRMED") return booking;
        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "CANNOT_CONFIRM_CANCELLED_BOOKING", null, 400);
        }

        if (booking.paymentIntentId) {
            await this.paymentService.capture(id, "STRIPE");
        }
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
            if (uri) console.log(`Google Meet link created: ${uri} `);
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
            `${format(booking.date, "yyyy-MM-dd")} ${booking.startTime} `,
            "yyyy-MM-dd HH:mm",
            new Date()
        );
        const endDateTime = parse(
            `${format(booking.date, "yyyy-MM-dd")} ${booking.endTime} `,
            "yyyy-MM-dd HH:mm",
            new Date()
        );

        const eventBody: any = {
            summary: `Booking: ${serviceName} `,
            description: `Client: ${booking.clientEmail} `,
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
        await BookingValidator.validateBookingExists(id);

        return await prisma.booking.update({
            where: { id },
            data: { status: "COMPLETED" },
            include: { service: true }
        });
    }

    async cancelBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);

        if (booking.paymentIntentId) {
            return await this.paymentService.cancel(id, "STRIPE");
        }

        return await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true }
        });
    }

    async getBookingMetadata(startDateStr: string, endDateStr: string) {
        const { startDate, endDate } = BookingValidator.validateDateRange(
            startDateStr,
            endDateStr
        );

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