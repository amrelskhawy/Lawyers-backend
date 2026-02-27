import Stripe from "stripe";
import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { BookingService } from "../../../bookings/bookings.service.js";
import { format } from "date-fns";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export class StripeService {
    private _bookingService: any;

    private async getBookingService() {
        if (!this._bookingService) {
            const { BookingService } = await import("../../../bookings/bookings.service.js");
            this._bookingService = new BookingService();
        }
        return this._bookingService;
    }

    constructor() { }

    async createCustomer(email: string, name: string) {
        const customer = await stripe.customers.create({
            email,
            name,
        });
        return customer;
    }

    async getCustomer(customer_id: string) {
        const customer = await stripe.customers.retrieve(customer_id);
        return customer;
    }

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

        const amountInHalalas = Math.round(Number(booking.service.price) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInHalalas,
            currency: "sar",
            capture_method: "manual",   // ← freeze, don't charge yet
            metadata: {
                bookingId: booking.id,
                clientEmail: booking.clientEmail,
                serviceId: booking.serviceId,
            },
            description: `Booking #${booking.id} — ${booking.service.name_en}`,
        });

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

    // async createPaymentIntent(customer_id: string, amount: number) {

    //     console.log({
    //         customer_id,
    //         amount
    //     });

    //     // 2. Create and confirm the charge immediately
    //     // Create the intent but DON'T confirm it here
    //     const paymentIntent = await stripe.paymentIntents.create({
    //         amount: Math.round(amount * 100),
    //         currency: 'sar',
    //         customer: customer_id,
    //         // This ensures the card is NOT saved for later, 
    //         // enforcing a fresh entry next time.
    //         setup_future_usage: undefined,
    //         automatic_payment_methods: { enabled: true },
    //     });

    //     return paymentIntent;
    // }

    async createPaymentLink(customer_id: string, amount: number, bookingId: string) {
        const session = await stripe.checkout.sessions.create({
            customer: customer_id,
            line_items: [
                {
                    price_data: {
                        currency: 'sar',
                        product_data: {
                            name: 'Service Payment', // Name shown on the Stripe page
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            payment_intent_data: {
                capture_method: 'manual',
                metadata: {
                    bookingId,
                },
            },
            success_url: 'https://your-app.com/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://your-app.com/cart',
        });

        return { url: session.url };
    }


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
            data: {
                paymentStatus: "AUTHORIZED",
                paymentIntentId: pi.id,
            },
        });

        console.log(`Booking ${bookingId} — payment AUTHORIZED (funds frozen), PI saved: ${pi.id}`);
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
            throw new AppResponse(false, "STRIPE_NO_PAYMENT_INTENT", null, 400);
        }
        if (booking.paymentStatus !== "AUTHORIZED") {
            throw new AppResponse(false, "PAYMENT_NOT_AUTHORIZED", null, 400);
        }

        // Capture the frozen funds
        await stripe.paymentIntents.capture(booking.paymentIntentId);

        // Update immediately (webhook will also fire as backup)
        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
        });

        // Delegate Meet + Calendar + Email to BookingService
        const bookingService = await this.getBookingService();
        return await bookingService.confirmBooking(bookingId);
    }

    // async captureAndConfirm(payment_intent_id: string) {
    //     const res = await stripe.paymentIntents.capture(payment_intent_id);
    //     return res;
    // }


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