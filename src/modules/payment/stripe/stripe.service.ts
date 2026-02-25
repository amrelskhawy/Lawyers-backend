import Stripe from "stripe";
import prisma from "../../../core/db/prisma.js";
import { AppResponse } from "../../../core/utils/AppResponse.js";
import { BookingService } from "../../bookings/bookings.service.js";
import { format } from "date-fns";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export class StripeService {
    private _bookingService: any;

    private async getBookingService() {
        if (!this._bookingService) {
            const { BookingService } = await import("../../bookings/bookings.service.js");
            this._bookingService = new BookingService();
        }
        return this._bookingService;
    }

    constructor() { }

    /**
     * Step 1 — Client books → Create a Stripe PaymentIntent in manual capture mode.
     * The card is authorized (money frozen) but NOT captured yet.
     * Returns a clientSecret for the frontend to confirm the payment.
     */
    async createPaymentIntent(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        if (booking.status !== "PENDING") {
            throw new AppResponse(false, "BOOKING_NOT_PENDING", null, 400);
        }
        if (booking.paymentStatus === "PAID" || booking.paymentStatus === "AUTHORIZED") {
            throw new AppResponse(false, "ALREADY_PAID", null, 400);
        }

        const amountInHalalas = Math.round(Number(booking.service.price) * 100); // SAR → halalas

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInHalalas,
            currency: "sar",
            capture_method: "manual", // ← authorize only, capture later on admin confirm
            metadata: {
                bookingId: booking.id,
                clientEmail: booking.clientEmail,
                serviceId: booking.serviceId,
            },
            description: `Booking #${booking.id} — ${booking.service.name_en}`,
        });

        // Persist paymentIntentId on the booking
        await prisma.booking.update({
            where: { id: bookingId },
            data: {
                paymentIntentId: paymentIntent.id,
                paymentStatus: "PENDING",
            },
        });

        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: amountInHalalas,
            currency: "sar",
        };
    }

    /**
     * Step 2 — Create a Stripe Checkout Session (alternative to PaymentIntent Elements).
     * Redirects to Stripe-hosted checkout page. Uses manual capture.
     */
    async createCheckoutSession(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        if (booking.status !== "PENDING") {
            throw new AppResponse(false, "BOOKING_NOT_PENDING", null, 400);
        }

        const amountInHalalas = Math.round(Number(booking.service.price) * 100);

        // First create a PaymentIntent with manual capture
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInHalalas,
            currency: "sar",
            capture_method: "manual",
            metadata: {
                bookingId: booking.id,
                clientEmail: booking.clientEmail,
            },
        });

        // Create a Checkout Session linked to the PaymentIntent
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "sar",
                        product_data: {
                            name: booking.service.name_en,
                            description: `Booking on ${format(new Date(booking.date), "yyyy-MM-dd")} at ${booking.startTime}`,
                        },
                        unit_amount: amountInHalalas,
                    },
                    quantity: 1,
                },
            ],
            payment_intent_data: {
                capture_method: "manual",
                metadata: {
                    bookingId: booking.id,
                    clientEmail: booking.clientEmail,
                },
            },
            customer_email: booking.clientEmail,
            success_url: `${FRONTEND_URL}/booking/${booking.id}?status=success`,
            cancel_url: `${FRONTEND_URL}/booking/${booking.id}?status=cancelled`,
            metadata: {
                bookingId: booking.id,
            },
        });

        // Persist session + intent ids
        await prisma.booking.update({
            where: { id: bookingId },
            data: {
                paymentIntentId: session.payment_intent as string,
                stripeSessionId: session.id,
                paymentStatus: "PENDING",
            },
        });

        return {
            checkoutUrl: session.url,
            sessionId: session.id,
        };
    }

    /**
     * Step 3 — Stripe webhook handler.
     * Listens for payment_intent.amount_capturable_updated → marks booking as AUTHORIZED.
     * This means the card was successfully authorized (money frozen).
     */
    async handleWebhook(rawBody: Buffer, signature: string) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: any) {
            console.error("Webhook signature verification failed:", err.message);
            throw new AppResponse(false, "INVALID_WEBHOOK_SIGNATURE", null, 400);
        }

        console.log(`Stripe webhook received: ${event.type}`);

        switch (event.type) {
            case "payment_intent.amount_capturable_updated": {
                // Card authorized — money is frozen, waiting for admin to capture
                const pi = event.data.object as Stripe.PaymentIntent;
                await this.onPaymentAuthorized(pi);
                break;
            }

            case "payment_intent.succeeded": {
                // Payment fully captured (after admin confirms)
                const pi = event.data.object as Stripe.PaymentIntent;
                await this.onPaymentCaptured(pi);
                break;
            }

            case "payment_intent.canceled": {
                // PaymentIntent cancelled (authorization released)
                const pi = event.data.object as Stripe.PaymentIntent;
                await this.onPaymentCancelled(pi);
                break;
            }

            case "charge.refunded": {
                // Refund processed
                const charge = event.data.object as Stripe.Charge;
                await this.onRefundProcessed(charge);
                break;
            }

            default:
                console.log(`Unhandled webhook event: ${event.type}`);
        }

        return { received: true };
    }

    /** Card authorized — mark booking paymentStatus = AUTHORIZED */
    private async onPaymentAuthorized(pi: Stripe.PaymentIntent) {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) return;

        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "AUTHORIZED" },
        });

        console.log(`Booking ${bookingId} — payment AUTHORIZED (funds frozen)`);
    }

    /** Payment captured — mark booking paymentStatus = PAID */
    private async onPaymentCaptured(pi: Stripe.PaymentIntent) {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) return;

        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
        });

        console.log(`Booking ${bookingId} — payment CAPTURED (PAID)`);
    }

    /** PaymentIntent cancelled — mark booking paymentStatus = RELEASED */
    private async onPaymentCancelled(pi: Stripe.PaymentIntent) {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) return;

        await prisma.booking.update({
            where: { id: bookingId },
            data: {
                paymentStatus: "RELEASED",
                status: "CANCELLED",
            },
        });

        console.log(`Booking ${bookingId} — payment authorization RELEASED`);
    }

    /** Refund processed — mark booking paymentStatus = REFUNDED */
    private async onRefundProcessed(charge: Stripe.Charge) {
        const bookingId = charge.metadata?.bookingId;
        if (!bookingId) {
            // Try to find via payment intent
            const paymentIntentId = charge.payment_intent as string;
            if (!paymentIntentId) return;

            const booking = await prisma.booking.findFirst({
                where: { paymentIntentId },
            });
            if (!booking) return;

            await prisma.booking.update({
                where: { id: booking.id },
                data: { paymentStatus: "REFUNDED", status: "CANCELLED" },
            });
            console.log(`Booking ${booking.id} — REFUNDED`);
            return;
        }

        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "REFUNDED", status: "CANCELLED" },
        });

        console.log(`Booking ${bookingId} — REFUNDED`);
    }

    /**
     * Admin confirms booking:
     * 1. Capture the frozen payment
     * 2. Create Google Meet + Calendar event
     * 3. Send confirmation email
     */
    async captureAndConfirm(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        if (!booking.paymentIntentId) {
            throw new AppResponse(false, "NO_PAYMENT_INTENT", null, 400);
        }
        if (booking.paymentStatus !== "AUTHORIZED") {
            throw new AppResponse(false, "PAYMENT_NOT_AUTHORIZED", null, 400);
        }

        // Capture the payment (unfreeze money to our account)
        await stripe.paymentIntents.capture(booking.paymentIntentId);

        // Update paymentStatus immediately (webhook will also fire)
        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
        });

        // Delegate to existing BookingService.confirmBooking for Meet + email
        const bookingService = await this.getBookingService();
        const confirmedBooking = await bookingService.confirmBooking(bookingId);

        return confirmedBooking;
    }

    /**
     * Cancel booking:
     * - If AUTHORIZED (not yet captured) → cancel PaymentIntent (releases hold)
     * - If PAID (already captured) → issue full refund
     */
    async cancelAndRefund(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "ALREADY_CANCELLED", null, 400);
        }

        if (!booking.paymentIntentId) {
            // No payment was made — just cancel the booking
            return await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
                include: { service: true },
            });
        }

        if (booking.paymentStatus === "AUTHORIZED") {
            // Money is frozen but not captured → cancel authorization (full release, no charge)
            await stripe.paymentIntents.cancel(booking.paymentIntentId);

            return await prisma.booking.update({
                where: { id: bookingId },
                data: {
                    status: "CANCELLED",
                    paymentStatus: "RELEASED",
                },
                include: { service: true },
            });
        }

        if (booking.paymentStatus === "PAID") {
            // Money was captured → issue a full refund
            const refund = await stripe.refunds.create({
                payment_intent: booking.paymentIntentId,
                reason: "requested_by_customer",
                metadata: { bookingId: booking.id },
            });

            console.log(`Refund created: ${refund.id} for booking ${bookingId}`);

            return await prisma.booking.update({
                where: { id: bookingId },
                data: {
                    status: "CANCELLED",
                    paymentStatus: "REFUNDED",
                },
                include: { service: true },
            });
        }

        // Fallback — just cancel
        return await prisma.booking.update({
            where: { id: bookingId },
            data: { status: "CANCELLED" },
            include: { service: true },
        });
    }

    async getPaymentStatus(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            select: {
                id: true,
                status: true,
                paymentStatus: true,
                paymentIntentId: true,
                stripeSessionId: true,
            },
        });

        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        return booking;
    }
}