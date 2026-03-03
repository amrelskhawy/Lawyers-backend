import Stripe from "stripe";
import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { startOfDay } from "date-fns";
import {
    IPaymentProvider,
    CreatePaymentResult,
    CaptureResult,
    CancelResult,
    WebhookResult,
    PaymentProvider,
    BookingPayload
} from "../../interfaces/payment.interface.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export class StripeProvider implements IPaymentProvider {
    readonly name: PaymentProvider = "STRIPE";

    async createCustomer(email: string, name: string) {
        return await stripe.customers.create({ email, name });
    }

    async getCustomer(customer_id: string) {
        return await stripe.customers.retrieve(customer_id);
    }

    async checkCustomerEmail(customer_email: string) {
        const customers = (await stripe.customers.list()).data;
        const customer = customers.filter(cu => cu.email === customer_email)

        return customer.length > 0 ? customer[0] : null;
    }

    async createPayment(
        customer_id: string,
        amount: number,
        bookingPayload: BookingPayload
    ): Promise<CreatePaymentResult> {
        const session = await stripe.checkout.sessions.create({
            customer: customer_id,
            line_items: [{
                price_data: {
                    currency: "sar",
                    product_data: { name: "Service Payment" },
                    unit_amount: Math.round(Number(bookingPayload.totalAmount) * 100),
                },
                quantity: 1,
            }],
            mode: "payment",
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min expiry
            payment_intent_data: {
                capture_method: "manual",
                metadata: bookingPayload as unknown as Record<string, string>,
            },
            metadata: bookingPayload as unknown as Record<string, string>,
            success_url: `${FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/booking/cancelled`,
        });

        return {
            url: session.url!,
            sessionId: session.id,
            amount: Math.round(Number(bookingPayload.totalAmount) * 100),
            currency: "sar",
            provider: this.name,
        };
    }


    async capture(bookingId: string): Promise<CaptureResult> {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

        if (!booking?.paymentIntentId) {
            throw new AppResponse(false, "NO_PAYMENT_INTENT_FOUND", null, 400);
        }

        // Verify PI is still capturable on Stripe's side (handles 7-day expiry)
        const pi = await stripe.paymentIntents.retrieve(booking.paymentIntentId);

        if (pi.status === "succeeded") {
            return {
                success: true,
                provider: this.name,
                paymentIntentId: pi.id,
                status: pi.status,
            };
        }

        if (pi.status !== "requires_capture") {
            throw new AppResponse(
                false,
                `PAYMENT_INTENT_NOT_CAPTURABLE: current status is ${pi.status}`,
                null,
                400
            );
        }

        const captured = await stripe.paymentIntents.capture(booking.paymentIntentId);

        return {
            success: true,
            provider: this.name,
            paymentIntentId: captured.id,
            status: captured.status,
        };
    }


    async cancel(bookingId: string): Promise<CancelResult> {
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

        // No payment was made — just cancel the booking
        if (!booking!.paymentIntentId) {
            await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
            });
            return { success: true, provider: this.name, status: "cancelled" };
        }

        // Funds frozen but not captured → release hold, customer not charged
        if (booking!.paymentStatus === "AUTHORIZED") {
            await stripe.paymentIntents.cancel(booking!.paymentIntentId);
            await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "RELEASED" },
            });
            return { success: true, provider: this.name, status: "released" };
        }

        // Funds already captured → issue full refund
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
        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET!
            );
        } catch (err: any) {
            throw new AppResponse(false, "INVALID_WEBHOOK_SIGNATURE", null, 400);
        }

        console.log(`[Stripe Webhook] ${event.type}`);

        switch (event.type) {
            case "checkout.session.completed":
                await this.onCheckoutCompleted(event.data.object as Stripe.CheckoutSession);
                break;
            case "checkout.session.expired":
                await this.onCheckoutExpired(event.data.object as Stripe.CheckoutSession);
                break;
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


    private async onCheckoutCompleted(session: Stripe.CheckoutSession) {
        // Idempotency guard — skip if already processed (handles Stripe retries)
        const existing = await prisma.booking.findFirst({
            where: { stripeSessionId: session.id },
        });
        if (existing) {
            console.log(`[Stripe] Session ${session.id} already processed — skipping`);
            return;
        }

        const m = session.metadata as any;
        if (!m?.serviceId) {
            console.error("[Stripe] checkout.session.completed missing metadata", session.id);
            return;
        }

        const bookingDay = startOfDay(new Date(m.date));

        // Race condition guard — re-check slot availability at payment time
        const conflict = await prisma.booking.findFirst({
            where: {
                date: bookingDay,
                status: { not: "CANCELLED" },
                startTime: { lt: m.endTime },
                endTime: { gt: m.startTime },
            },
        });

        if (conflict) {
            console.warn(`[Stripe] Slot conflict for session ${session.id} — cancelling PI`);
            await stripe.paymentIntents.cancel(session.payment_intent as string);
            // TODO: sendEmail to m.clientEmail — slot taken, refund coming
            return;
        }

        // Create the real booking — rethrow so Stripe retries on failure
        try {
            await prisma.booking.create({
                data: {
                    serviceId: m.serviceId,
                    clientEmail: m.clientEmail,
                    name: m.name,
                    phone_number: m.phone,
                    date: bookingDay,
                    startTime: m.startTime,
                    endTime: m.endTime,
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                    paymentIntentId: session.payment_intent as string,
                    stripeSessionId: session.id,
                    totalAmount: m.totalAmount,
                },
            });
            console.log(`[Stripe] Booking created after payment for session ${session.id}`);
        } catch (error) {
            console.error("[Stripe] CRITICAL: Payment received but booking creation failed", {
                sessionId: session.id,
                metadata: m,
                error,
            });
            throw error; // Stripe retries on 500
        }
    }

    private async onCheckoutExpired(session: Stripe.CheckoutSession) {
        const email = session.customer_email || session.metadata?.clientEmail;
        console.log(`[Stripe] Session expired for ${email} — session: ${session.id}`);
        // TODO: sendEmailWithTemplate(email, "sessionExpired", {...})
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
        console.log(`[Stripe] Booking ${bookingId} — hold released`);
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