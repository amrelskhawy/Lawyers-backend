import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { format } from "date-fns";
import { sendEmailWithTemplate } from "../../core/utils/email.js"; ``
import { PaymentService } from "../payment/payment.service.js";
import { PaymentFactory } from "../payment/payment.factory.js";
import { StripeProvider } from "../payment/providers/stripe/stripe.provider.js";
import { getStripeReceiptUrl } from "../payment/providers/stripe/stripe.provider.js";
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
            // Stripe booking
            const result = await this.paymentService.cancel(id, "STRIPE");
            await this.sendCancellationEmail(booking, result);
            return result;
        }
        if ((booking as any).tabbyPaymentId) {
            // Tabby booking
            const result = await this.paymentService.cancel(id, "TABBY");
            await this.sendCancellationEmail(booking, result);
            return result;
        }

        const result = await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true }
        });
        await this.sendCancellationEmail(booking, { status: "cancelled" });
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
            await sendEmailWithTemplate(
                booking.clientEmail,
                subject,
                "bookingCancelled",
                {
                    name: booking.name,
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