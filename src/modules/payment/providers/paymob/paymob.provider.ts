import crypto from "crypto";
import { CustomerService } from "@app/modules/customers/customers.service.js";
import { OrganizerService } from "@app/modules/organizers/organizers.service.js";
import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { IPaymentProvider, BookingPayload } from "../../interfaces/payment.interface.js";

function getPaymobBase(): string {
    return process.env.PAYMOB_BASE_URL || "https://accept.paymob.com";
}

async function paymobRequest(method: "GET" | "POST", path: string, body?: object): Promise<any> {
    const response = await fetch(`${getPaymobBase()}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
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
        console.error("[Paymob] API error:", { path, status: response.status, data });
        throw new AppResponse(false, "PAYMOB_API_ERROR", data, response.status);
    }

    return data;
}

function verifyHmac(payload: string, secret: string, received: string): boolean {
    const expected = crypto.createHmac("sha512", secret).update(payload).digest("hex");
    return expected === received;
}

export class PaymobProvider implements IPaymentProvider {
    constructor(private customerService: CustomerService) {}

    async createPayment(_customer_id: string, amount: number, payload: BookingPayload) {
        const apiKey = process.env.PAYMOB_API_KEY;
        const integrationId = process.env.PAYMOB_INTEGRATION_ID;
        const iframeId = process.env.PAYMOB_IFRAME_ID;
        const currency = process.env.PAYMOB_CURRENCY || "EGP";
        const successUrl = process.env.PAYMOB_SUCCESS_URL || "";
        const cancelUrl = process.env.PAYMOB_CANCEL_URL || "";

        if (!apiKey) throw new AppResponse(false, "PAYMOB_API_KEY_MISSING", null, 500);
        if (!integrationId) throw new AppResponse(false, "PAYMOB_INTEGRATION_ID_MISSING", null, 500);
        if (!iframeId) throw new AppResponse(false, "PAYMOB_IFRAME_ID_MISSING", null, 500);

        // Step 1 — authenticate
        const authData = await paymobRequest("POST", "/api/auth/tokens", { api_key: apiKey });
        const authToken: string = authData.token;
        if (!authToken) throw new AppResponse(false, "PAYMOB_AUTH_FAILED", authData, 500);

        // Build reference_id using the same pipe-delimited pattern as Tabby/Tamara
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

        const amountCents = Math.round(amount * 100);

        // Step 2 — create order
        const orderData = await paymobRequest("POST", "/api/ecommerce/orders", {
            auth_token: authToken,
            delivery_needed: false,
            amount_cents: amountCents,
            currency,
            merchant_order_id: referenceId,
            items: [
                {
                    name: `Service Booking – ${payload.date}`,
                    amount_cents: amountCents,
                    description: `${payload.startTime}–${payload.endTime}`,
                    quantity: 1,
                },
            ],
        });
        const orderId: string = String(orderData.id);
        if (!orderId) throw new AppResponse(false, "PAYMOB_ORDER_CREATION_FAILED", orderData, 500);

        // Step 3 — get payment key
        const keyData = await paymobRequest("POST", "/api/acceptance/payment_keys", {
            auth_token: authToken,
            amount_cents: amountCents,
            expiration: 1800, // 30 minutes
            order_id: orderId,
            currency,
            integration_id: parseInt(integrationId, 10),
            billing_data: {
                apartment: "NA",
                email: payload.clientEmail,
                floor: "NA",
                first_name: payload.name.split(" ")[0] || payload.name,
                last_name: payload.name.split(" ").slice(1).join(" ") || "NA",
                street: "NA",
                building: "NA",
                phone_number: payload.phone,
                shipping_method: "NA",
                postal_code: "NA",
                city: "NA",
                country: "EG",
                state: "NA",
            },
            redirection_url: successUrl,
            lock_order_when_paid: false,
        });
        const paymentKey: string = keyData.token;
        if (!paymentKey) throw new AppResponse(false, "PAYMOB_PAYMENT_KEY_FAILED", keyData, 500);

        const checkoutUrl = `${getPaymobBase()}/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;

        console.log(`[Paymob] Checkout created for order ${orderId}`);

        return {
            url: checkoutUrl,
            sessionId: paymentKey,
            paymentId: orderId,
            qrCode: null,
            provider: "PAYMOB",
        };
    }

    async handleWebhook(rawBody: Buffer, hmacValue: string): Promise<any> {
        const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
        if (!hmacSecret) throw new AppResponse(false, "PAYMOB_HMAC_SECRET_MISSING", null, 500);

        let event: any;
        try {
            event = JSON.parse(rawBody.toString());
        } catch {
            throw new AppResponse(false, "INVALID_WEBHOOK_PAYLOAD", null, 400);
        }

        // Paymob HMAC is computed over specific concatenated fields from the transaction object
        const transaction = event.obj ?? event;
        const hmacString = this.buildHmacString(transaction);

        if (!hmacValue || !verifyHmac(hmacString, hmacSecret, hmacValue)) {
            throw new AppResponse(false, "INVALID_WEBHOOK_SIGNATURE", null, 400);
        }

        const type = event.type as string | undefined;
        const success: boolean = transaction.success === true || transaction.success === "true";
        const voided: boolean = transaction.is_voided === true;
        const refunded: boolean = transaction.is_refunded === true;

        console.log(`[Paymob Webhook] type=${type} success=${success} voided=${voided} refunded=${refunded}`);

        if (type === "TRANSACTION" && success && !voided && !refunded) {
            await this.onTransactionSuccess(transaction);
        } else if (type === "TRANSACTION" && voided) {
            await this.onTransactionVoided(transaction);
        } else if (type === "TRANSACTION" && refunded) {
            await this.onTransactionRefunded(transaction);
        } else {
            console.log(`[Paymob Webhook] Unhandled: type=${type} success=${success}`);
        }

        return { received: true };
    }

    async capture(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        if (!(booking as any).paymobOrderId) {
            throw new AppResponse(false, "PAYMOB_NO_ORDER_ID", null, 400);
        }

        // Paymob online card transactions auto-capture on success.
        // We simply mark the DB record as PAID here.
        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "PAID" },
            include: { service: true },
        });

        console.log(`[Paymob] Booking ${bookingId} marked PAID`);
        return { success: true, provider: "PAYMOB", booking: updated };
    }

    async cancel(bookingId: string): Promise<any> {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);

        const apiKey = process.env.PAYMOB_API_KEY;
        if (!apiKey) throw new AppResponse(false, "PAYMOB_API_KEY_MISSING", null, 500);

        const paymobOrderId = (booking as any).paymobOrderId as string | null;

        if (!paymobOrderId) {
            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED" },
                include: { service: true },
            });
            return { status: "cancelled", booking: updated };
        }

        // Authenticate to get a fresh token for the void/refund call
        const authData = await paymobRequest("POST", "/api/auth/tokens", { api_key: apiKey });
        const authToken: string = authData.token;
        if (!authToken) throw new AppResponse(false, "PAYMOB_AUTH_FAILED", null, 500);

        if (booking.paymentStatus === "AUTHORIZED") {
            // Void (release hold) — Paymob void endpoint
            await paymobRequest("POST", "/api/acceptance/void_refund/void", {
                auth_token: authToken,
                transaction_id: paymobOrderId,
            });

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "RELEASED" },
                include: { service: true },
            });
            console.log(`[Paymob] Void issued for booking ${bookingId}`);
            return { status: "released", booking: updated };
        }

        if (booking.paymentStatus === "PAID") {
            // Full refund
            const refund = await paymobRequest("POST", "/api/acceptance/void_refund/refund", {
                auth_token: authToken,
                transaction_id: paymobOrderId,
                amount_cents: Math.round(Number(booking.totalAmount) * 100),
            });

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: { status: "CANCELLED", paymentStatus: "REFUNDED" },
                include: { service: true },
            });
            console.log(`[Paymob] Refund issued for booking ${bookingId}: ${refund?.id}`);
            return { status: "refunded", refundId: refund?.id, booking: updated };
        }

        throw new AppResponse(
            false,
            "PAYMOB_INVALID_CANCEL_STATE",
            { paymentStatus: booking.paymentStatus },
            400
        );
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private buildHmacString(transaction: any): string {
        // Paymob HMAC concatenation order (from Paymob docs)
        const fields = [
            transaction.amount_cents,
            transaction.created_at,
            transaction.currency,
            transaction.error_occured,
            transaction.has_parent_transaction,
            transaction.id,
            transaction.integration_id,
            transaction.is_3d_secure,
            transaction.is_auth,
            transaction.is_capture,
            transaction.is_refunded,
            transaction.is_standalone_payment,
            transaction.is_voided,
            transaction.order?.id,
            transaction.owner,
            transaction.pending,
            transaction.source_data?.pan,
            transaction.source_data?.sub_type,
            transaction.source_data?.type,
            transaction.success,
        ];
        return fields.join("");
    }

    private async onTransactionSuccess(transaction: any) {
        const transactionId = String(transaction.id);
        if (!transactionId) {
            console.warn("[Paymob] transaction.success missing id — skipping");
            return;
        }

        // ── Idempotency: already processed? ──────────────────────────────────
        const existing = await prisma.booking.findFirst({
            where: { paymobOrderId: transactionId } as any,
        });
        if (existing) {
            console.log(`[Paymob] Transaction ${transactionId} already processed — skipping`);
            return;
        }

        // ── Parse merchant_order_id (pipe-delimited reference_id) ────────────
        const merchantOrderId: string = transaction.order?.merchant_order_id ?? "";
        if (!merchantOrderId || !merchantOrderId.includes("|")) {
            console.error(`[Paymob] Missing or invalid merchant_order_id: ${merchantOrderId}`);
            return;
        }

        const [serviceId, clientEmail, name, phone, date, startTime, endTime, totalAmount] =
            merchantOrderId.split("|");

        if (!serviceId || !clientEmail || !date || !startTime) {
            console.error(`[Paymob] Incomplete merchant_order_id: ${merchantOrderId}`);
            return;
        }

        // ── Race condition: slot already taken? ───────────────────────────────
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
                `[Paymob] Slot conflict for transaction ${transactionId} — issuing immediate refund`
            );
            try {
                const apiKey = process.env.PAYMOB_API_KEY;
                if (apiKey) {
                    const authData = await paymobRequest("POST", "/api/auth/tokens", { api_key: apiKey });
                    await paymobRequest("POST", "/api/acceptance/void_refund/refund", {
                        auth_token: authData.token,
                        transaction_id: transactionId,
                        amount_cents: transaction.amount_cents,
                    });
                }
            } catch (refundErr: any) {
                console.error(`[Paymob] Failed to refund conflicting transaction: ${refundErr?.message}`);
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
                    paymobOrderId: transactionId,
                } as any,
                include: { service: true, customer: true },
            });

            console.log(`[Paymob] Booking created for transaction ${transactionId}`);

            try {
                const organizerService = new OrganizerService();
                await organizerService.notifyOrganizers("booked", newBooking);
            } catch (notifyErr: any) {
                console.error("[Organizer] Notification failed:", notifyErr?.message);
            }
        } catch (err: any) {
            console.error("[Paymob] CRITICAL: Payment received but booking creation failed", {
                transactionId,
                merchantOrderId,
                error: err,
            });
            throw err;
        }
    }

    private async onTransactionVoided(transaction: any) {
        const transactionId = String(transaction.id);
        const booking = await prisma.booking.findFirst({
            where: { paymobOrderId: transactionId } as any,
        });

        if (!booking) {
            console.warn(`[Paymob] Voided transaction ${transactionId} — no booking found`);
            return;
        }

        if (booking.paymentStatus === "RELEASED") {
            console.log(`[Paymob] Transaction ${transactionId} already voided — skipping`);
            return;
        }

        await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: "RELEASED", status: "CANCELLED" },
        });

        console.log(`[Paymob] Booking ${booking.id} marked RELEASED via void webhook`);
    }

    private async onTransactionRefunded(transaction: any) {
        const transactionId = String(transaction.id);
        const booking = await prisma.booking.findFirst({
            where: { paymobOrderId: transactionId } as any,
        });

        if (!booking) {
            console.warn(`[Paymob] Refunded transaction ${transactionId} — no booking found`);
            return;
        }

        if (booking.paymentStatus === "REFUNDED") {
            console.log(`[Paymob] Transaction ${transactionId} already refunded — skipping`);
            return;
        }

        await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: "REFUNDED", status: "CANCELLED" },
        });

        console.log(`[Paymob] Booking ${booking.id} marked REFUNDED via refund webhook`);
    }
}
