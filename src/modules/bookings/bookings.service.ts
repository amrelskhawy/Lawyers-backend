import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { format } from "date-fns";
import { sendEmailWithTemplate } from "../../core/utils/email.js"; ``
import { PaymentService } from "../payment/payment.service.js";
import { PaymentFactory } from "../payment/payment.factory.js";
import { StripeProvider } from "../payment/providers/stripe/stripe.provider.js";
import { getStripeReceiptUrl } from "../payment/providers/stripe/stripe.provider.js";
import { BookingValidator } from "./bookings.validator.js";
import { createGoogleEvent } from "../../core/services/google/calendar.js";
import { EmailService } from "../emails/index.js";
import { OrganizerService } from "../organizers/organizers.service.js";


export class BookingService {
    private paymentService: PaymentService;
    private emailService: EmailService;
    private organizerService: OrganizerService;

    constructor() {
        this.paymentService = new PaymentService();
        this.emailService = new EmailService();
        this.organizerService = new OrganizerService();
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
        try {
            await sendEmailWithTemplate(
                clientEmail,
                "Complete your booking payment — link expires in 30 minutes",
                "paymentLinkSent",
                {
                    name: payload.name,
                    payment_link: paymentResult.url,
                    service_name: service.name_en,
                    date: format(bookingDay, "yyyy-MM-dd"),
                    start_time: cleanStartTime,
                    end_time: endTime,
                    expires_in_minutes: 30,
                    provider,
                }
            );
        } catch (emailErr: any) {
            console.error("[Email] Failed to send paymentLinkSent:", emailErr?.message);
        }

        // No booking saved yet — it gets created in the webhook after payment
        return {
            payment_link: paymentResult.url,
            qr_code: paymentResult.qrCode ?? null
        };
    }

    async createManualBooking(payload: any, createdByRole: string) {
        const { bookingDay, cleanStartTime, endTime, service } =
            await BookingValidator.validateCreateBooking(payload);

        const customer = await prisma.customer.findUnique({
            where: { id: payload.customerId },
        });
        if (!customer || customer.isDeleted) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        const booking = await prisma.booking.create({
            data: {
                customerId: payload.customerId,
                serviceId: payload.serviceId,
                date: bookingDay,
                startTime: cleanStartTime,
                endTime,
                status: "PENDING",
                paymentStatus: "AUTHORIZED",
                totalAmount: service.price ? new Prisma.Decimal(String(service.price)) : new Prisma.Decimal(0),
                createdByRole,
            },
            include: { service: true, customer: true },
        });

        // Notify organizers about new manual booking (best-effort)
        try {
            await this.organizerService.notifyOrganizers("booked", booking);
        } catch (err: any) {
            console.error("[Organizer] Notification failed:", err?.message);
        }

        return booking;
    }

    async captureManualPayment(id: string) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: { service: true, customer: true },
        });

        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        if (!booking.createdByRole) throw new AppResponse(false, "NOT_A_MANUAL_BOOKING", null, 400);
        if (booking.paymentStatus !== "AUTHORIZED") throw new AppResponse(false, "PAYMENT_NOT_AUTHORIZED", null, 400);

        const updated = await prisma.booking.update({
            where: { id },
            data: { paymentStatus: "PAID" },
            include: { service: true, customer: true },
        });

        return updated;
    }

    async confirmBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);
        if (booking.status === "CONFIRMED") return booking;
        BookingValidator.validateConfirmable(booking);

        // Detect provider from whichever payment ID field is set on the booking
        if (booking.paymentIntentId) {
            await this.paymentService.capture(id, "STRIPE");
        } else if ((booking as any).tabbyPaymentId) {
            await this.paymentService.capture(id, "TABBY");
        }
        // If neither field is set, no capture needed (booking was created without payment)
        // if (!this.calendar) {
        //     console.error("Google Calendar integration is not initialized.");
        //     throw new AppResponse(false, "CALENDAR_INTEGRATION_DISABLED", null, 503);
        // }

        try {
            const { calendarUrl, meetLink } = await createGoogleEvent(booking, booking.service.name_en);
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    meetLink,
                    status: "CONFIRMED",
                    paymentStatus: "PAID",
                },
                include: { service: true, customer: true },
            });

            await this.emailService.sendConfirmationEmail(updatedBooking);

            // Notify organizers (best-effort)
            try {
                await this.organizerService.notifyOrganizers("confirmed", updatedBooking);
            } catch (err: any) {
                console.error("[Organizer] Notification failed:", err?.message);
            }

            return updatedBooking;

        } catch (error: any) {
            const msg = error?.cause?.message ?? error?.response?.data?.error?.message ?? error?.message ?? "Unknown error";
            console.error("Booking confirmation failed:", msg);
            throw new AppResponse(false, "BOOKING_CONFIRMATION_FAILED", null, 500);
        }
    }

    async getAllBookings() {
        return await prisma.booking.findMany({
            include: { service: true, customer: true },
            orderBy: { date: "desc" },
        });
    }

    async completeBooking(id: string) {
        await BookingValidator.validateBookingExists(id);

        return await prisma.booking.update({
            where: { id },
            data: { status: "COMPLETED" },
            include: { service: true, customer: true }
        });
    }

    async cancelBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);

        if (booking.paymentIntentId) {
            // Stripe booking
            const result = await this.paymentService.cancel(id, "STRIPE");
            await this.sendCancellationEmail(booking, result);
            try { await this.organizerService.notifyOrganizers("cancelled", booking); } catch (err: any) { console.error("[Organizer] Notification failed:", err?.message); }
            return result;
        }
        if ((booking as any).tabbyPaymentId) {
            // Tabby booking
            const result = await this.paymentService.cancel(id, "TABBY");
            await this.sendCancellationEmail(booking, result);
            try { await this.organizerService.notifyOrganizers("cancelled", booking); } catch (err: any) { console.error("[Organizer] Notification failed:", err?.message); }
            return result;
        }

        const result = await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true, customer: true }
        });
        await this.sendCancellationEmail(booking, { status: "cancelled" });

        // Notify organizers about cancellation (best-effort)
        try {
            await this.organizerService.notifyOrganizers("cancelled", result);
        } catch (err: any) {
            console.error("[Organizer] Notification failed:", err?.message);
        }

        return result;
    }

    // EMAIL 3 — Booking Cancelled (best-effort, never blocks response)
    private async sendCancellationEmail(booking: any, result: any) {
        const providerLabel = booking.paymentIntentId
            ? "STRIPE"
            : (booking as any).tabbyPaymentId
                ? "TABBY"
                : "TAMARA";

        const serviceName = booking.service?.name_en || "";
        const subject = `Your booking has been cancelled — ${serviceName}`;

        // For Stripe refunds: attempt to fetch and attach the refund receipt PDF
        let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
        if (booking.paymentIntentId && result?.status === "refunded") {
            try {
                const receiptUrl = await getStripeReceiptUrl(booking.paymentIntentId);
                if (receiptUrl) {
                    const response = await fetch(receiptUrl);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        attachments = [{
                            filename: "refund-receipt.pdf",
                            content: Buffer.from(arrayBuffer),
                            contentType: "application/pdf",
                        }];
                    }
                }
            } catch (pdfErr: any) {
                console.error("[Email] Failed to fetch Stripe refund receipt PDF — sending without attachment:", pdfErr?.message);
                // Continue without attachment
            }
        }

        try {
            if (!booking.customer.email) throw new Error("No customer email — skipping");
            await sendEmailWithTemplate(
                booking.customer.email,
                subject,
                "bookingCancelled",
                {
                    name: booking.customer.fullName,
                    service_name: serviceName,
                    date: format(new Date(booking.date), "yyyy-MM-dd"),
                    start_time: booking.startTime,
                    end_time: booking.endTime,
                    payment_status: result?.status ?? "cancelled",
                    total_amount: String(booking.totalAmount),
                    provider: providerLabel,
                },
                attachments
            );
        } catch (emailErr: any) {
            console.error("[Email] Failed to send bookingCancelled:", emailErr?.message);
        }
    }
}