import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { format, startOfDay } from "date-fns";
import { PaymentService } from "../payment/payment.service.js";
import { PaymentFactory } from "../payment/payment.factory.js";
import { StripeProvider } from "../payment/providers/stripe/stripe.provider.js";
import { BookingValidator } from "./bookings.validator.js";
import { createGoogleEvent } from "../../core/services/google/calendar.js";
import { GoogleService } from "@app/core/services/google/service.js";
import { EmailService } from "../emails/index.js";


export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    private paymentService: PaymentService;
    private emailService: EmailService;

    constructor() {
        this.availabilityEngine = new AvailabilityEngine();
        this.paymentService = new PaymentService();
        this.emailService = new EmailService();
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
        BookingValidator.validateConfirmable(booking);

        if (booking.paymentIntentId) {
            await this.paymentService.capture(id, "STRIPE");
        }

        try {
            const { calendarUrl, meetLink } = await createGoogleEvent(booking, booking.service.name_en);
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    meetLink,
                    status: "CONFIRMED",
                    paymentStatus: "PAID",
                },
                include: { service: true },
            });

            await this.emailService.sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
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

        if (booking.paymentIntentId) {
            return await this.paymentService.cancel(id, "STRIPE");
        }

        return await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true }
        });
    }
}