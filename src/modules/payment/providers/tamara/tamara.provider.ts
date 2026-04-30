import { CustomerService } from "@app/modules/customers/customers.service.js";
import { OrganizerService } from "@app/modules/organizers/organizers.service.js";
import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { IPaymentProvider, BookingPayload } from "../../interfaces/payment.interface.js";


const TAMARA_BASE_URL = process.env.TAMARA_BASE_URL || "https://api-sandbox.tamara.co";

async function tamaraRequest(
    method: "GET" | "POST",
    path: string,
    body?: object
): Promise<any> {
    const apiToken = process.env.TAMARA_API_TOKEN;
    if (!apiToken) throw new AppResponse(false, "TAMARA_API_TOKEN_MISSING", null, 500);

    const response = await fetch(`${TAMARA_BASE_URL}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const rawText = await response.text();
    let data: any;
    try {
        data = rawText ? JSON.parse(rawText) : {};
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
    constructor(private customerService: CustomerService) { }

    async createPayment(
        _customer_id: string,    // unused — Tamara has no persistent customer object
        amount: number,
        payload: BookingPayload
    ) {
        const currency = process.env.TAMARA_CURRENCY || "SAR";
        const countryCode = process.env.TAMARA_COUNTRY_CODE || "SA";
        const successUrl = process.env.TAMARA_SUCCESS_URL;
        const cancelUrl = process.env.TAMARA_CANCEL_URL;
        const failureUrl = process.env.TAMARA_FAILURE_URL || cancelUrl;
        const notificationUrl = process.env.TAMARA_NOTIFICATION_URL;

        if (!successUrl || !cancelUrl || !notificationUrl) {
            throw new AppResponse(false, "TAMARA_URLS_MISSING", null, 500);
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

        const [firstName, ...rest] = (payload.name || "").trim().split(/\s+/);
        const lastName = rest.join(" ") || firstName || "Customer";

        const body = {
            order_reference_id: referenceId,
            total_amount: { amount: amount.toFixed(2), currency },
            description: `Booking: ${payload.date} ${payload.startTime}–${payload.endTime}`,
            country_code: countryCode,
            payment_type: "PAY_BY_INSTALMENTS",
            locale: "en_US",
            items: [{
                reference_id: payload.serviceId,
                type: "Digital",
                name: `Service Booking – ${payload.date}`,
                sku: payload.serviceId,
                quantity: 1,
                unit_price: { amount: amount.toFixed(2), currency },
                total_amount: { amount: amount.toFixed(2), currency },
            }],
            consumer: {
                first_name: firstName || "Customer",
                last_name: lastName,
                phone_number: payload.phone,
                email: payload.clientEmail,
            },
            shipping_address: {
                first_name: firstName || "Customer",
                last_name: lastName,
                line1: "Online Booking",
                city: "Riyadh",
                country_code: countryCode,
                phone_number: payload.phone,
            },
            tax_amount: { amount: "0.00", currency },
            shipping_amount: { amount: "0.00", currency },
            merchant_url: {
                success: successUrl,
                failure: failureUrl,
                cancel: cancelUrl,
                notification: notificationUrl,
            },
        };

        const session = await tamaraRequest("POST", "/checkout", body);

        if (session.status === "rejected" || session.status === "declined") {
            throw new AppResponse(false, "TAMARA_CUSTOMER_REJECTED", session, 400);
        }

        const checkoutUrl = session.checkout_url;
        if (!checkoutUrl) {
            throw new AppResponse(false, "TAMARA_NO_CHECKOUT_URL", session, 500);
        }

        console.log(`[Tamara] Checkout session created: ${session.checkout_id} order=${session.order_id}`);

        return {
            url: checkoutUrl,
            sessionId: session.checkout_id,
            paymentId: session.order_id,
            qrCode: null,
            provider: "TAMARA",
        };
    }

    async handleWebhook(rawBody: Buffer, signature: string): Promise<any> {
        const webhookSecret = process.env.TAMARA_WEBHOOK_SECRET;
        if (!webhookSecret || signature !== webhookSecret) {
            throw new AppResponse(false, "INVALID_WEBHOOK_SIGNATURE", null, 400);
        }

        let event: any;
        try {
            event = JSON.parse(rawBody.toString());
        } catch {
            throw new AppResponse(false, "INVALID_WEBHOOK_PAYLOAD", null, 400);
        }

        console.log("[Tamara Webhook] Raw event:", JSON.stringify(event, null, 2));

        const eventType = (event.event_type || event.type) as string;
        const orderId = event.order_id || event.data?.order_id;
        const orderReferenceId = event.order_reference_id || event.data?.order_reference_id;

        console.log(`[Tamara Webhook] type=${eventType} order_id=${orderId}`);

        if (eventType === "order_approved" || eventType === "order_authorised") {
            await this.onOrderApproved({ ...event, order_id: orderId, order_reference_id: orderReferenceId });
        } else if (eventType === "payment_captured") {
            await this.onPaymentCaptured({ ...event, order_id: orderId });
        } else if (eventType === "payment_refunded") {
            await this.onPaymentRefunded({ ...event, order_id: orderId });
        } else if (eventType === "order_declined" || eventType === "order_expired" || eventType === "order_canceled") {
            console.log(`[Tamara] Order ${eventType}: ${orderId}`);
        } else {
            console.log(`[Tamara Webhook] Unhandled: type=${eventType}`);
        }

        return { received: true };
    }


    async capture(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        if (!booking.tamaraOrderId) {
            throw new AppResponse(false, "TAMARA_NO_ORDER_ID", null, 400);
        }

        const currency = process.env.TAMARA_CURRENCY || "SAR";
        const order = await tamaraRequest("GET", `/orders/${booking.tamaraOrderId}`);
        if (order.status !== "approved" && order.status !== "authorised") {
            throw new AppResponse(
                false,
                "TAMARA_PAYMENT_NOT_CAPTURABLE",
                { currentStatus: order.status },
                400
            );
        }

        await tamaraRequest("POST", `/payments/capture`, {
            order_id: booking.tamaraOrderId,
            total_amount: { amount: String(booking.totalAmount), currency },
            tax_amount: { amount: "0.00", currency },
            shipping_amount: { amount: "0.00", currency },
            shipping_info: { shipped_at: new Date().toISOString(), shipping_company: "Online" },
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

        // No Tamara order — just cancel in DB
        if (!booking.tamaraOrderId) {
            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
                include: { service: true },
            });
            return { status: "cancelled", booking: updated };
        }

        const currency = process.env.TAMARA_CURRENCY || "SAR";

        // ── AUTHORIZED → cancel order (release hold) ─────────────────────────
        if (booking.paymentStatus === "AUTHORIZED") {
            await tamaraRequest("POST", `/orders/${booking.tamaraOrderId}/cancel`, {
                total_amount: { amount: String(booking.totalAmount), currency },
            });

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "RELEASED" },
                include: { service: true },
            });

            console.log(`[Tamara] Order cancelled (hold released) for booking ${bookingId}`);
            return { status: "released", booking: updated };
        }

        // ── PAID → simplified refund ─────────────────────────────────────────
        if (booking.paymentStatus === "PAID") {
            const refund = await tamaraRequest(
                "POST",
                `/payments/simplified-refund/${booking.tamaraOrderId}`,
                {
                    total_amount: { amount: String(booking.totalAmount), currency },
                }
            );

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
                include: { service: true },
            });

            console.log(`[Tamara] Refund issued for booking ${bookingId}: refund ${refund.refund_id || refund.id}`);
            return { status: "refunded", refundId: refund.refund_id || refund.id, booking: updated };
        }

        throw new AppResponse(
            false,
            "TAMARA_INVALID_CANCEL_STATE",
            { paymentStatus: booking.paymentStatus },
            400
        );
    }

    private async onOrderApproved(event: any) {
        const orderId = event.order_id;
        if (!orderId) {
            console.warn("[Tamara] order_approved missing order_id — skipping");
            return;
        }

        // ── Idempotency: already processed? ──────────────────────────────────
        const existing = await prisma.booking.findFirst({
            where: { tamaraOrderId: orderId },
        });
        if (existing) {
            console.log(`[Tamara] Order ${orderId} already processed — skipping`);
            return;
        }

        // ── Parse reference_id back into booking fields ───────────────────────
        const referenceId = event.order_reference_id;
        if (!referenceId || !referenceId.includes("|")) {
            console.error(`[Tamara] order_approved missing or invalid reference_id: ${referenceId}`);
            return;
        }

        const [serviceId, clientEmail, name, phone, date, startTime, endTime, totalAmount] =
            referenceId.split("|");

        if (!serviceId || !clientEmail || !date || !startTime) {
            console.error(`[Tamara] order_approved incomplete reference_id: ${referenceId}`);
            return;
        }

        // ── Race condition: slot already booked by someone else? ─────────────
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
            console.error(
                `[Tamara] Slot conflict for order ${orderId} — cancelling order (no charge)`
            );
            try {
                const currency = process.env.TAMARA_CURRENCY || "SAR";
                await tamaraRequest("POST", `/orders/${orderId}/cancel`, {
                    total_amount: { amount: String(totalAmount || "0"), currency },
                });
            } catch (err: any) {
                console.error(`[Tamara] Failed to cancel conflicting order: ${err?.message}`);
            }
            return;
        }

        // ── Create booking ────────────────────────────────────────────────────
        try {
            const customerId = await this.customerService.findOrCreateCustomerFromBooking({
                fullName: name,
                email: clientEmail,
                phone,
            });

            const newBooking = await prisma.booking.create({
                data: {
                    customerId,
                    serviceId,
                    date: new Date(date),
                    startTime,
                    endTime,
                    totalAmount: parseFloat(totalAmount || "0"),
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                    tamaraOrderId: orderId,
                },
                include: { service: true, customer: true },
            });

            console.log(`[Tamara] Booking created after order_approved for order ${orderId}`);

            // Notify organizers about new booking (best-effort)
            try {
                const organizerService = new OrganizerService();
                await organizerService.notifyOrganizers("booked", newBooking);
            } catch (notifyErr: any) {
                console.error("[Organizer] Notification failed:", notifyErr?.message);
            }
        } catch (err: any) {
            // Rethrow so Tamara retries the webhook (returns non-200)
            console.error("[Tamara] CRITICAL: Order approved but booking creation failed", {
                orderId,
                referenceId,
                error: err,
            });
            throw err;
        }
    }

    private async onPaymentCaptured(event: any) {
        const orderId = event.order_id;
        if (!orderId) return;

        const booking = await prisma.booking.findFirst({
            where: { tamaraOrderId: orderId },
        });

        if (!booking) {
            console.warn(`[Tamara] payment_captured — no booking for order ${orderId}`);
            return;
        }

        if (booking.paymentStatus === "PAID") {
            console.log(`[Tamara] payment_captured already handled for booking ${booking.id} — skipping`);
            return;
        }

        await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: "PAID" },
        });

        console.log(`[Tamara] Booking ${booking.id} marked PAID via payment_captured webhook`);
    }

    private async onPaymentRefunded(event: any) {
        const orderId = event.order_id;
        if (!orderId) return;

        const booking = await prisma.booking.findFirst({
            where: { tamaraOrderId: orderId },
        });

        if (!booking) {
            console.warn(`[Tamara] payment_refunded — no booking for order ${orderId}`);
            return;
        }

        if (booking.paymentStatus === "REFUNDED") {
            console.log(`[Tamara] payment_refunded already handled for booking ${booking.id} — skipping`);
            return;
        }

        await prisma.booking.update({
            where: { id: booking.id },
            data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
        });

        console.log(`[Tamara] Booking ${booking.id} marked REFUNDED via payment_refunded webhook`);
    }
}
