import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { IPaymentProvider, BookingPayload } from "../../interfaces/payment.interface.js";

async function tamaraRequest(
    method: "GET" | "POST",
    path: string,
    body?: object
): Promise<any> {
    const baseUrl = process.env.TAMARA_API_URL || "https://api-sandbox.tamara.co";
    const token = process.env.TAMARA_MERCHANT_TOKEN;
    console.log("Tamara token:", token);
    if (!token) throw new AppResponse(false, "TAMARA_MERCHANT_TOKEN_MISSING", null, 500);

    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${token}`,
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
        console.error("[Tamara] API error:", { path, status: response.status, data });
        throw new AppResponse(false, "TAMARA_API_ERROR", data, response.status);
    }

    return data;
}

export class TamaraProvider implements IPaymentProvider {

    async createPayment(
        _customer_id: string,
        amount: number,
        payload: BookingPayload
    ) {
        const currency = process.env.TAMARA_CURRENCY || "SAR";
        const successUrl = process.env.TAMARA_SUCCESS_URL;
        const cancelUrl = process.env.TAMARA_CANCEL_URL;

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
            order_reference_id: referenceId,
            order_number: `BK-${Date.now()}`,
            total_amount: {
                amount: amount.toFixed(2),
                currency,
            },
            description: `Booking: ${payload.date} ${payload.startTime}–${payload.endTime}`,
            country_code: "SA",
            payment_type: "PAY_BY_INSTALMENTS",
            instalments: 3,
            locale: "en_US",
            items: [{
                reference_id: payload.serviceId,
                type: "Services",
                name: `Service Booking – ${payload.date}`,
                sku: payload.serviceId,
                quantity: 1,
                unit_price: {
                    amount: amount.toFixed(2),
                    currency,
                },
                total_amount: {
                    amount: amount.toFixed(2),
                    currency,
                }
            }],
            consumer: {
                email: payload.clientEmail,
                first_name: payload.name.split(" ")[0] || payload.name,
                last_name: payload.name.split(" ").slice(1).join(" ") || "-",
                phone_number: payload.phone,
            },
            billing_address: {
                first_name: payload.name.split(" ")[0] || payload.name,
                last_name: payload.name.split(" ").slice(1).join(" ") || "-",
                line1: "Online Booking",
                city: "Riyadh",
                country_code: "SA",
                phone_number: payload.phone,
            },
            shipping_address: {
                first_name: payload.name.split(" ")[0] || payload.name,
                last_name: payload.name.split(" ").slice(1).join(" ") || "-",
                line1: "Online Booking",
                city: "Riyadh",
                country_code: "SA",
                phone_number: payload.phone,
            },
            merchant_url: {
                success: successUrl,
                failure: cancelUrl,
                cancel: cancelUrl,
                notification: `${process.env.TAMARA_WEBHOOK_BASE_URL || process.env.TABBY_SUCCESS_URL?.replace("/payment/success", "")}/api/v1/payment/webhook/tamara`,
            }
        };

        const session = await tamaraRequest("POST", "/checkout", body);

        if (!session.checkout_url) {
            throw new AppResponse(false, "TAMARA_NO_CHECKOUT_URL", session, 500);
        }

        console.log(`[Tamara] Checkout session created: ${session.order_id}`);

        return {
            url: session.checkout_url,
            sessionId: session.checkout_id,
            paymentId: session.order_id,   // Tamara calls it order_id
            provider: "TAMARA",
        };
    }

    // ── handleWebhook ─────────────────────────────────────────────────────────
    // Tamara sends tamaraToken in Authorization header as Bearer token
    // Events: order_approved → we authorise → order_authorised → create booking
    //         order_captured, order_expired, order_declined, order_canceled
    async handleWebhook(rawBody: Buffer, signature: string): Promise<any> {
        // signature = Authorization header value = "Bearer <tamaraToken>"
        const notificationToken = process.env.TAMARA_NOTIFICATION_TOKEN;
        const bearerToken = signature?.replace("Bearer ", "").trim();

        if (!notificationToken || bearerToken !== notificationToken) {
            throw new AppResponse(false, "INVALID_TAMARA_WEBHOOK_SIGNATURE", null, 400);
        }

        let event: any;
        try {
            event = JSON.parse(rawBody.toString());
        } catch {
            throw new AppResponse(false, "INVALID_WEBHOOK_PAYLOAD", null, 400);
        }

        const eventType = event.event_type as string;
        const orderId = event.order_id as string;

        console.log(`[Tamara Webhook] event=${eventType} order=${orderId}`);

        switch (eventType) {
            case "order_approved":
                await this.onOrderApproved(orderId, event);
                break;
            case "order_authorised":
                await this.onOrderAuthorised(orderId, event);
                break;
            case "order_captured":
                await this.onOrderCaptured(orderId);
                break;
            case "order_expired":
            case "order_declined":
                console.log(`[Tamara] Order ${orderId} ${eventType} — no action needed`);
                break;
            case "order_canceled":
                console.log(`[Tamara] Order ${orderId} canceled via webhook`);
                break;
            default:
                console.log(`[Tamara Webhook] Unhandled event: ${eventType}`);
        }

        return { received: true };
    }

    async capture(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        const tamaraOrderId = (booking as any).tamaraOrderId;
        if (!tamaraOrderId) {
            throw new AppResponse(false, "TAMARA_NO_ORDER_ID", null, 400);
        }

        await tamaraRequest("POST", `/payments/capture/${tamaraOrderId}`, {
            total_amount: {
                amount: String(booking.totalAmount),
                currency: process.env.TAMARA_CURRENCY || "SAR",
            },
        });

        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
            include: { service: true },
        });

        console.log(`[Tamara] Payment captured for booking ${bookingId}`);
        return { success: true, provider: "TAMARA", booking: updated };
    }

    async cancel(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        const tamaraOrderId = (booking as any).tamaraOrderId;

        if (!tamaraOrderId) {
            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
                include: { service: true },
            });
            return { status: "cancelled", booking: updated };
        }

        if (booking.paymentStatus === "AUTHORIZED") {
            await tamaraRequest("POST", `/orders/${tamaraOrderId}/cancel`, {
                total_amount: {
                    amount: String(booking.totalAmount),
                    currency: process.env.TAMARA_CURRENCY || "SAR",
                },
            });

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "RELEASED" },
                include: { service: true },
            });

            console.log(`[Tamara] Order cancelled (void) for booking ${bookingId}`);
            return { status: "released", booking: updated };
        }

        if (booking.paymentStatus === "PAID") {
            const refund = await tamaraRequest("POST", `/payments/${tamaraOrderId}/refund`, {
                total_amount: {
                    amount: String(booking.totalAmount),
                    currency: process.env.TAMARA_CURRENCY || "SAR",
                },
                comment: "Booking cancelled by merchant",
            });

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
                include: { service: true },
            });

            console.log(`[Tamara] Refund issued for booking ${bookingId}`);
            return { status: "refunded", refundId: refund.refund_id, booking: updated };
        }

        throw new AppResponse(
            false,
            "TAMARA_INVALID_CANCEL_STATE",
            { paymentStatus: booking.paymentStatus },
            400
        );
    }

    private async onOrderApproved(orderId: string, event: any) {
        if (!orderId) {
            console.warn("[Tamara] order_approved missing order_id — skipping");
            return;
        }

        console.log(`[Tamara] Authorising order ${orderId}...`);
        try {
            await tamaraRequest("POST", `/orders/${orderId}/authorise`);
            console.log(`[Tamara] Order ${orderId} authorised successfully`);
        } catch (err: any) {
            console.error(`[Tamara] Failed to authorise order ${orderId}:`, err?.message);
            throw err; // return non-200 so Tamara retries
        }
    }

    private async onOrderAuthorised(orderId: string, event: any) {
        if (!orderId) return;

        const existing = await (prisma.booking as any).findFirst({
            where: { tamaraOrderId: orderId },
        });
        if (existing) {
            console.log(`[Tamara] Order ${orderId} already processed — skipping`);
            return;
        }

        // Parse reference_id from webhook
        const referenceId = event.order_reference_id as string;
        if (!referenceId || !referenceId.includes("|")) {
            console.error(`[Tamara] order_authorised missing reference_id: ${referenceId}`);
            return;
        }

        const [serviceId, clientEmail, name, phone, date, startTime, endTime, totalAmount] =
            referenceId.split("|");

        if (!serviceId || !clientEmail || !date || !startTime) {
            console.error(`[Tamara] order_authorised incomplete reference_id: ${referenceId}`);
            return;
        }

        // Race condition check
        const conflict = await prisma.booking.findFirst({
            where: {
                serviceId,
                date: new Date(date),
                startTime,
                endTime,
                status: { not: "CANCELLED" },
            },
        });

        if (conflict) {
            console.error(`[Tamara] Slot conflict for order ${orderId} — cancelling order`);
            try {
                await tamaraRequest("POST", `/orders/${orderId}/cancel`, {
                    total_amount: {
                        amount: totalAmount,
                        currency: process.env.TAMARA_CURRENCY || "SAR",
                    },
                });
            } catch (err: any) {
                console.error(`[Tamara] Failed to cancel conflicting order: ${err?.message}`);
            }
            return;
        }

        try {
            await (prisma.booking as any).create({
                data: {
                    serviceId,
                    clientEmail,
                    name,
                    phone_number: phone,
                    date: new Date(date),
                    startTime,
                    endTime,
                    totalAmount: parseFloat(totalAmount || "0"),
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                    tamaraOrderId: orderId,
                },
            });

            console.log(`[Tamara] Booking created for order ${orderId}`);
        } catch (err: any) {
            console.error("[Tamara] CRITICAL: Booking creation failed", { orderId, error: err });
            throw err;
        }
    }

    private async onOrderCaptured(orderId: string) {
        if (!orderId) return;

        const booking = await (prisma.booking as any).findFirst({
            where: { tamaraOrderId: orderId },
        });

        if (!booking) {
            console.warn(`[Tamara] order_captured — no booking for order ${orderId}`);
            return;
        }

        if (booking.paymentStatus === "PAID" || booking.paymentStatus === "RELEASED") {
            console.log(`[Tamara] order_captured already handled for booking ${booking.id} — skipping`);
            return;
        }

        await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: "PAID" },
        });

        console.log(`[Tamara] Booking ${booking.id} marked PAID via order_captured webhook`);
    }
}