import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { IPaymentProvider, BookingPayload } from "../../interfaces/payment.interface.js";

const TABBY_BASE_URL = "https://api.tabby.ai/api";

async function tabbyRequest(
    method: "GET" | "POST",
    path: string,
    body?: object
): Promise<any> {
    const secretKey = process.env.TABBY_SECRET_KEY;
    if (!secretKey) throw new AppResponse(false, "TABBY_SECRET_KEY_MISSING", null, 500);

    const response = await fetch(`${TABBY_BASE_URL}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${secretKey}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const rawText = await response.text();
    let data: any;
    try {
        data = JSON.parse(rawText);
    } catch {
        data = { raw: rawText };
    }

    if (!response.ok) {
        console.error("[Tabby] API error:", { path, status: response.status, data });
        throw new AppResponse(false, "TABBY_API_ERROR", data, response.status);
    }

    return data;
}


export class TabbyProvider implements IPaymentProvider {
    async createPayment(
        _customer_id: string,    // unused — Tabby has no customer object
        amount: number,
        payload: BookingPayload
    ) {
        const currency = process.env.TABBY_CURRENCY || "SAR";
        const merchantCode = process.env.TABBY_MERCHANT_CODE;
        const successUrl = process.env.TABBY_SUCCESS_URL;
        const cancelUrl = process.env.TABBY_CANCEL_URL;

        if (!merchantCode) {
            throw new AppResponse(false, "TABBY_MERCHANT_CODE_MISSING", null, 500);
        }

        const referenceId = [
            payload.serviceId,
            payload.clientEmail,
            payload.name,
            payload.phone,
            payload.date,
            payload.startTime,
            payload.endTime,
            payload.totalAmount,
        ].join("|");

        const body = {
            payment: {
                amount: amount.toFixed(2),
                currency,
                description: `Booking: ${payload.date} ${payload.startTime}–${payload.endTime}`,
                buyer: {
                    phone: payload.phone,
                    email: payload.clientEmail,
                    name: payload.name,
                },
                shipping_address: {
                    city: "Riyadh",
                    address: "Online Booking",
                    zip: "00000",
                },
                order: {
                    tax_amount: "0.00",
                    shipping_amount: "0.00",
                    discount_amount: "0.00",
                    updated_at: new Date().toISOString(),
                    reference_id: referenceId,
                    items: [{
                        title: `Service Booking – ${payload.date}`,
                        quantity: 1,
                        unit_price: amount.toFixed(2),
                        reference_id: payload.serviceId,
                        category: "Services",
                    }],
                },
                buyer_history: {
                    registered_since: new Date().toISOString(),
                    loyalty_level: 0,
                },
            },
            lang: "en",
            merchant_code: merchantCode,
            merchant_urls: {
                success: successUrl,
                cancel: cancelUrl,
                failure: cancelUrl,
            },
        };

        const session = await tabbyRequest("POST", "/v2/checkout", body);

        if (session.status === "rejected") {
            throw new AppResponse(false, "TABBY_CUSTOMER_REJECTED", session, 400);
        }

        const checkoutUrl =
            session.configuration?.available_products?.installments?.[0]?.web_url ||
            session.configuration?.available_products?.pay_in_full?.[0]?.web_url;

        if (!checkoutUrl) {
            throw new AppResponse(false, "TABBY_NO_CHECKOUT_URL", session, 500);
        }

        console.log(`[Tabby] Checkout session created: ${session.id}`);

        return {
            url: checkoutUrl,
            sessionId: session.id,
            paymentId: session.payment?.id,
            qrCode: session.configuration?.available_products?.installments?.[0]?.qr_code ?? null,
            provider: "TABBY",
        };
    }

    async handleWebhook(rawBody: Buffer, signature: string): Promise<any> {
        const webhookSecret = process.env.TABBY_WEBHOOK_SECRET;
        if (!webhookSecret || signature !== webhookSecret) {
            throw new AppResponse(false, "INVALID_WEBHOOK_SIGNATURE", null, 400);
        }

        let event: any;
        try {
            event = JSON.parse(rawBody.toString());
        } catch {
            throw new AppResponse(false, "INVALID_WEBHOOK_PAYLOAD", null, 400);
        }

        console.log("[Tabby Webhook] Raw event:", JSON.stringify(event, null, 2));

        const eventType = event.type as string;
        const status = (event.status as string)?.toLowerCase();
        const payment = event;

        console.log(`[Tabby Webhook] type=${eventType} status=${status}`);

        if (eventType === "payment.authorized" || status === "authorized") {
            await this.onPaymentAuthorized(payment);
        } else if (eventType === "payment.closed" || status === "closed") {
            await prisma.booking.updateMany({
                where: {
                    tabbyPaymentId: payment.id,
                    status: "RESERVED",
                },
                data: { status: "CANCELLED" },
            });
            await this.onPaymentClosed(payment);
        } else if (eventType === "payment.expired" || status === "expired") {
            await prisma.booking.updateMany({
                where: {
                    tabbyPaymentId: payment.id,
                    status: "RESERVED",
                },
                data: { status: "CANCELLED" },
            });
            console.log(`[Tabby] Reservation CANCELLED — payment expired: ${payment?.id}`);
        } else {
            console.log(`[Tabby Webhook] Unhandled: type=${eventType} status=${status}`);
        }

        return { received: true };
    }


    async capture(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        if (!booking.tabbyPaymentId) {
            throw new AppResponse(false, "TABBY_NO_PAYMENT_ID", null, 400);
        }

        // Verify payment is still AUTHORIZED on Tabby before capturing
        const payment = await tabbyRequest("GET", `/v2/payments/${booking.tabbyPaymentId}`);
        if (payment.status !== "AUTHORIZED") {
            throw new AppResponse(
                false,
                "TABBY_PAYMENT_NOT_CAPTURABLE",
                { currentStatus: payment.status },
                400
            );
        }

        // Capture full amount
        await tabbyRequest("POST", `/v1/payments/${booking.tabbyPaymentId}/captures`, {
            amount: String(booking.totalAmount),
            tax_amount: "0.00",
            shipping_amount: "0.00",
            discount_amount: "0.00",
            items: [{
                title: `Service Booking`,
                quantity: 1,
                unit_price: String(booking.totalAmount),
                reference_id: booking.serviceId,
                category: "Services",
            }],
        });

        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
            include: { service: true },
        });

        console.log(`[Tabby] Payment captured for booking ${bookingId}`);
        return { success: true, provider: "TABBY", booking: updated };
    }

    async cancel(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        // No Tabby payment — just cancel in DB
        if (!booking.tabbyPaymentId) {
            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
                include: { service: true },
            });
            return { status: "cancelled", booking: updated };
        }

        // ── AUTHORIZED → close (void) ─────────────────────────────────────────
        if (booking.paymentStatus === "AUTHORIZED") {
            await tabbyRequest("POST", `/v1/payments/${booking.tabbyPaymentId}/close`, {});

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "RELEASED" },
                include: { service: true },
            });

            console.log(`[Tabby] Payment closed (hold released) for booking ${bookingId}`);
            return { status: "released", booking: updated };
        }

        // ── PAID → full refund ────────────────────────────────────────────────
        if (booking.paymentStatus === "PAID") {
            const refund = await tabbyRequest("POST", `/v1/payments/${booking.tabbyPaymentId}/refunds`, {
                amount: String(booking.totalAmount),
                reason: "Booking cancelled by merchant",
                items: [{
                    title: "Service Booking",
                    quantity: 1,
                    unit_price: String(booking.totalAmount),
                    reference_id: booking.serviceId,
                    category: "Services",
                }],
            });

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
                include: { service: true },
            });

            console.log(`[Tabby] Refund issued for booking ${bookingId}: refund ${refund.id}`);
            return { status: "refunded", refundId: refund.id, booking: updated };
        }

        throw new AppResponse(
            false,
            "TABBY_INVALID_CANCEL_STATE",
            { paymentStatus: booking.paymentStatus },
            400
        );
    }

    private async onPaymentAuthorized(payment: any) {
        await prisma.$transaction(async (tx) => {
            // Find the RESERVED row created at booking time
            const reservation = await tx.booking.findFirst({
                where: { tabbyPaymentId: payment.id },
            });

            if (!reservation) {
                console.error("[Tabby] No RESERVED row found for payment:", payment.id);
                return;
            }

            // Idempotency guard
            if (reservation.paymentStatus === "AUTHORIZED") {
                console.log(`[Tabby] Payment ${payment.id} already processed — skipping`);
                return;
            }

            await tx.booking.update({
                where: { id: reservation.id },
                data: {
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                },
            });

            console.log(`[Tabby] Booking ${reservation.id} promoted RESERVED → PENDING/AUTHORIZED`);
        }, { isolationLevel: "Serializable" });
    }

    private async onPaymentClosed(payment: any) {
        if (!payment?.id) return;

        const booking = await prisma.booking.findFirst({
            where: { tabbyPaymentId: payment.id },
        });

        if (!booking) {
            console.warn(`[Tabby] payment.closed — no booking for payment ${payment.id}`);
            return;
        }

        if (booking.paymentStatus === "PAID") {
            console.log(`[Tabby] payment.closed already handled for booking ${booking.id} — skipping`);
            return;
        }

        if (booking.paymentStatus === "RELEASED") {
            console.log(`[Tabby] payment.closed was a void (cancel), not a capture — skipping for booking ${booking.id}`);
            return;
        }

        await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: "PAID" },
        });

        console.log(`[Tabby] Booking ${booking.id} marked PAID via payment.closed webhook`);
    }
}