import Stripe from "stripe";
import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import {
    IPaymentProvider,
    CreatePaymentResult,
    CaptureResult,
    CancelResult,
    WebhookResult,
    PaymentProvider,
} from "../../interfaces/payment.interface.js";
import { PaymentValidator } from "../../validators/payment.validator.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export class StripeProvider implements IPaymentProvider {
    readonly name: PaymentProvider = "STRIPE";


    async createPayment(bookingId: string): Promise<CreatePaymentResult> {
        // Validator already ran in PaymentService — booking is guaranteed valid here
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        const amountInHalalas = Math.round(Number(booking!.service.price) * 100);

        // Create Stripe Customer for this booking
        const customer = await stripe.customers.create({
            email: booking!.clientEmail,
            name: booking!.name,
        });

        // Create Checkout Session with manual capture (freeze funds)
        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            line_items: [
                {
                    price_data: {
                        currency: "sar",
                        product_data: {
                            name: booking!.service.name_en,
                            description: `Booking on ${booking!.date} at ${booking!.startTime}`,
                        },
                        unit_amount: amountInHalalas,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            payment_intent_data: {
                capture_method: "manual",   // ← freeze funds, capture on admin confirm
                metadata: {
                    bookingId: booking!.id,
                    clientEmail: booking!.clientEmail,
                },
            },
            customer_email: booking!.clientEmail,
            success_url: `${FRONTEND_URL}/booking/${booking!.id}?status=success`,
            cancel_url: `${FRONTEND_URL}/booking/${booking!.id}?status=cancelled`,
            metadata: { bookingId: booking!.id },
        });

        // Persist session id on booking — paymentIntentId saved later via webhook
        await prisma.booking.update({
            where: { id: bookingId },
            data: {
                stripeSessionId: session.id,
                paymentStatus: "PENDING",
            },
        });

        return {
            url: session.url!,
            sessionId: session.id,
            amount: amountInHalalas,
            currency: "sar",
            provider: this.name,
        };
    }

    async capture(bookingId: string): Promise<CaptureResult> {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

        const paymentIntent = await stripe.paymentIntents.capture(booking!.paymentIntentId!);

        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
        });

        return {
            success: true,
            provider: this.name,
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
        };
    }


    async cancel(bookingId: string): Promise<CancelResult> {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

        // No payment exists — just cancel booking
        if (!booking!.paymentIntentId) {
            await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
            });
            return { success: true, provider: this.name, status: "cancelled" };
        }

        // AUTHORIZED → cancel hold, no charge, no refund
        if (booking!.paymentStatus === "AUTHORIZED") {
            await stripe.paymentIntents.cancel(booking!.paymentIntentId);
            await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "RELEASED" },
            });
            return { success: true, provider: this.name, status: "released" };
        }

        // PAID → issue full refund
        if (booking!.paymentStatus === "PAID") {
            const refund = await stripe.refunds.create({
                payment_intent: booking!.paymentIntentId,
                reason: "requested_by_customer",
                metadata: { bookingId: booking!.id },
            });
            await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
            });
            return {
                success: true,
                provider: this.name,
                status: "refunded",
                refundId: refund.id,
            };
        }

        // Fallback
        await prisma.booking.update({
            where: { id: bookingId },
            data: { status: "CANCELLED" },
        });
        return { success: true, provider: this.name, status: "cancelled" };
    }

    async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookResult> {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: any) {
            throw new AppResponse(false, `WEBHOOK_SIGNATURE_INVALID: ${err.message}`, null, 400);
        }

        console.log(`[Stripe Webhook] ${event.type}`);

        switch (event.type) {
            case "payment_intent.amount_capturable_updated":
                await this.onAuthorized(event.data.object as Stripe.PaymentIntent);
                break;
            case "payment_intent.succeeded":
                await this.onCaptured(event.data.object as Stripe.PaymentIntent);
                break;
            case "payment_intent.canceled":
                await this.onCancelled(event.data.object as Stripe.PaymentIntent);
                break;
            case "charge.refunded":
                await this.onRefunded(event.data.object as Stripe.Charge);
                break;
            default:
                console.log(`[Stripe Webhook] Unhandled: ${event.type}`);
        }

        return { received: true, event: event.type };
    }

    private async onAuthorized(pi: Stripe.PaymentIntent) {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) return;
        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "AUTHORIZED", paymentIntentId: pi.id },
        });
        console.log(`[Stripe] Booking ${bookingId} AUTHORIZED — PI: ${pi.id}`);
    }

    private async onCaptured(pi: Stripe.PaymentIntent) {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) return;
        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
        });
        console.log(`[Stripe] Booking ${bookingId} CAPTURED → PAID`);
    }

    private async onCancelled(pi: Stripe.PaymentIntent) {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) return;
        await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "RELEASED", status: "CANCELLED" },
        });
        console.log(`[Stripe] Booking ${bookingId} CANCELLED — hold released`);
    }

    private async onRefunded(charge: Stripe.Charge) {
        const bookingId = charge.metadata?.bookingId;
        const piId = charge.payment_intent as string;

        const booking = bookingId
            ? await prisma.booking.findUnique({ where: { id: bookingId } })
            : await prisma.booking.findFirst({ where: { paymentIntentId: piId } });

        if (!booking) return;

        await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: "REFUNDED", status: "CANCELLED" },
        });
        console.log(`[Stripe] Booking ${booking.id} REFUNDED`);
    }
}