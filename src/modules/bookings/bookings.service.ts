import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { startOfDay, format } from "date-fns";
import { PaymentService } from "../payment/payment.service.js";
import { PaymentFactory } from "../payment/payment.factory.js";
import { StripeProvider } from "../payment/providers/stripe/stripe.provider.js";
import { BookingValidator } from "./bookings.validator.js";
import { sendPaymentLinkEmail, sendConfirmationEmail, sendCancellationEmail } from "./bookings.email.js";
import { GoogleIntegration } from "./bookings.google.js";
import { detectProvider, buildMetadataResponse } from "./bookings.helpers.js";

export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    private paymentService: PaymentService;
    private googleIntegration: GoogleIntegration;

    constructor() {
        this.availabilityEngine = new AvailabilityEngine();
        this.paymentService = new PaymentService();
        this.googleIntegration = new GoogleIntegration();
    }

    async createBooking(payload: any) {
        const { clientEmail } = payload;

        const { bookingDay, cleanStartTime, endTime, service } =
            await BookingValidator.validateCreateBooking(payload);

        const provider = PaymentFactory.resolveProvider(payload.provider || "STRIPE");
        console.log("PROVIDER RESOLVED:", provider);
        // Stripe requires a customer object. Tabby and other providers do not.
        let customerId = "";
        if (provider === "STRIPE") {
            const stripeProvider = PaymentFactory.getProvider("STRIPE") as StripeProvider;
            const customer = await stripeProvider.checkCustomerEmail(clientEmail)
                || await stripeProvider.createCustomer(clientEmail, payload.name);
            customerId = customer.id;
        }

        const paymentResult = await this.paymentService.createPayment(
            customerId,
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
            provider
        );

        if (!paymentResult || !paymentResult.url) {
            throw new AppResponse(false, "PAYMENT_LINK_CREATION_FAILED", null, 500);
        }

        // EMAIL 1 — Payment Link Sent (best-effort, never blocks response)
        await sendPaymentLinkEmail(
            clientEmail,
            payload,
            paymentResult,
            service,
            bookingDay,
            cleanStartTime,
            endTime,
            provider
        );

        // No booking saved yet — it gets created in the webhook after payment
        return {
            payment_link: paymentResult.url,
            qr_code: paymentResult.qrCode ?? null
        };
    }

    async confirmBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);
        if (booking.status === "CONFIRMED") return booking;
        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "CANNOT_CONFIRM_CANCELLED_BOOKING", null, 400);
        }

        const provider = detectProvider(booking);
        if (provider) {
            await this.paymentService.capture(id, provider as any);
        }

        // if (!this.googleIntegration.calendar) {
        //     console.error("Google Calendar integration is not initialized.");
        //     throw new AppResponse(false, "CALENDAR_INTEGRATION_DISABLED", null, 503);
        // }

        try {
            // 1. Create Meet link via Meet REST API (best-effort)
            //const meetLink = await this.googleIntegration.createMeetLink(this.googleIntegration.meet);

            // 2. Create Google Calendar Event with the Meet link attached
            //const { calendarUrl } = await this.googleIntegration.createGoogleEvent(this.googleIntegration.calendar, booking, booking.service.name_en, meetLink);

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

            // 3. Send Confirmation Email (best-effort)
            await sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
            // Surface the real root-cause message for easier debugging
            const msg = error?.cause?.message ?? error?.response?.data?.error?.message ?? error?.message ?? "Unknown error";
            console.error("Booking confirmation failed:", msg);
            throw new AppResponse(false, "BOOKING_CONFIRMATION_FAILED", null, 500);
        }
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

        const provider = detectProvider(booking);
        if (provider) {
            const result = await this.paymentService.cancel(id, provider as any);
            await sendCancellationEmail(booking, result);
            return result;
        }

        const result = await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true }
        });
        await sendCancellationEmail(booking, { status: "cancelled" });
        return result;
    }

    async getBookingMetadata(startDateStr: string, endDateStr: string) {
        const { startDate, endDate } = BookingValidator.validateDateRange(
            startDateStr,
            endDateStr
        );
        const workingDays = await prisma.workingDay.findMany({
            orderBy: {
                day: 'asc'
            }
        });

        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: startOfDay(startDate),
                    lte: startOfDay(endDate)
                }
            }
        });

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

        return buildMetadataResponse(workingDays, holidays, bookings);
    }
}