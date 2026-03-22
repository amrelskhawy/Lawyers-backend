/**
 * tabby.test.ts — TabbyProvider full test suite
 *
 * Scenarios covered:
 *  1.  createPayment — returns checkout url + sessionId
 *  2.  createPayment — throws TABBY_CUSTOMER_REJECTED when Tabby rejects customer
 *  3.  createPayment — throws TABBY_NO_CHECKOUT_URL when no URL in response
 *  4.  Webhook — payment.authorized — happy path → booking created
 *  5.  Webhook — payment.authorized — idempotency → skipped if already processed
 *  6.  Webhook — payment.authorized — race condition → closes payment, no booking
 *  7.  Webhook — payment.authorized — DB failure → rethrows so Tabby retries
 *  8.  Webhook — payment.authorized — missing/invalid reference_id → skipped
 *  9.  Webhook — payment.expired → no booking, log only
 *  10. Webhook — payment.closed → updates paymentStatus to PAID
 *  11. Webhook — payment.closed → idempotent if already PAID
 *  12. Webhook — invalid signature → INVALID_WEBHOOK_SIGNATURE
 *  13. Webhook — invalid JSON body → INVALID_WEBHOOK_PAYLOAD
 *  14. capture — happy path → PAID
 *  15. capture — throws TABBY_NO_PAYMENT_ID when tabbyPaymentId missing
 *  16. capture — throws TABBY_PAYMENT_NOT_CAPTURABLE when status is CLOSED
 *  17. cancel AUTHORIZED → closes payment → RELEASED
 *  18. cancel PAID → full refund → REFUNDED
 *  19. cancel with no tabbyPaymentId → just cancels in DB
 *  20. cancel with invalid paymentStatus → TABBY_INVALID_CANCEL_STATE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// vi.hoisted — mock fetch before anything runs
// ─────────────────────────────────────────────────────────────────────────────
const mockFetch = vi.hoisted(() => vi.fn());

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.stubGlobal("fetch", mockFetch);

vi.mock("../../../../core/db/prisma.js", () => ({
    default: {
        booking: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

// ─────────────────────────────────────────────────────────────────────────────
// ENV setup (must be before import so provider reads them at construction)
// ─────────────────────────────────────────────────────────────────────────────
process.env.TABBY_SECRET_KEY = "sk_test_tabby_secret";
process.env.TABBY_MERCHANT_CODE = "TEST_MERCHANT";
process.env.TABBY_WEBHOOK_SECRET = "my-webhook-secret";
process.env.TABBY_CURRENCY = "SAR";
process.env.TABBY_SUCCESS_URL = "https://example.com/success";
process.env.TABBY_CANCEL_URL = "https://example.com/cancel";

// ─────────────────────────────────────────────────────────────────────────────
// Imports (AFTER mocks)
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../../../../core/db/prisma.js";
import { TabbyProvider } from "./tabby.provider.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tabbyOk(data: object) {
    mockFetch.mockResolvedValue({ ok: true, json: async () => data } as any);
}

function tabbyFail(data: object, status = 400) {
    mockFetch.mockResolvedValue({ ok: false, status, json: async () => data } as any);
}

const REFERENCE_ID = "service-abc|test@test.com|Test User|+966500000000|2026-08-15|10:00|11:00|500";

const makePayment = (overrides: Record<string, any> = {}) => ({
    id: "pay_tabby_123",
    status: "AUTHORIZED",
    order: { reference_id: REFERENCE_ID },
    ...overrides,
});

const makeBooking = (overrides: Record<string, any> = {}) => ({
    id: "booking-123",
    serviceId: "service-abc",
    clientEmail: "test@test.com",
    name: "Test User",
    phone_number: "+966500000000",
    date: new Date("2026-08-15"),
    startTime: "10:00",
    endTime: "11:00",
    status: "PENDING",
    paymentStatus: "AUTHORIZED",
    tabbyPaymentId: "pay_tabby_123",
    paymentIntentId: null,
    totalAmount: 500,
    service: { id: "service-abc", price: 500 },
    ...overrides,
});

const webhook = (type: string, payment: object) =>
    Buffer.from(JSON.stringify({ type, payment }));

const SIG = "my-webhook-secret";

// ─────────────────────────────────────────────────────────────────────────────
// 1–3. createPayment
// ─────────────────────────────────────────────────────────────────────────────
describe("TabbyProvider.createPayment", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns checkout url + sessionId on success", async () => {
        tabbyOk({
            id: "session_abc",
            status: "created",
            payment: { id: "pay_tabby_123" },
            configuration: {
                available_products: {
                    installments: [{ web_url: "https://checkout.tabby.ai/pay/session_abc" }],
                },
            },
        });

        const result = await new TabbyProvider().createPayment("unused", 500, {
            serviceId: "service-abc", clientEmail: "test@test.com",
            name: "Test User", phone: "+966500000000",
            date: "2026-08-15", startTime: "10:00", endTime: "11:00", totalAmount: "500",
        });

        expect(result.url).toBe("https://checkout.tabby.ai/pay/session_abc");
        expect(result.sessionId).toBe("session_abc");
        expect(result.paymentId).toBe("pay_tabby_123");
        expect(result.provider).toBe("TABBY");
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("/v2/checkout"),
            expect.objectContaining({ method: "POST" })
        );
    });

    it("throws TABBY_CUSTOMER_REJECTED when Tabby rejects customer", async () => {
        tabbyOk({ id: "session_rej", status: "rejected" });

        await expect(
            new TabbyProvider().createPayment("unused", 500, {
                serviceId: "service-abc", clientEmail: "bad@customer.com",
                name: "Bad", phone: "+1", date: "2026-08-15",
                startTime: "10:00", endTime: "11:00", totalAmount: "500",
            })
        ).rejects.toMatchObject({ message: "TABBY_CUSTOMER_REJECTED" });
    });

    it("throws TABBY_NO_CHECKOUT_URL when response has no url", async () => {
        tabbyOk({ id: "session_abc", status: "created", configuration: { available_products: {} } });

        await expect(
            new TabbyProvider().createPayment("unused", 500, {
                serviceId: "service-abc", clientEmail: "test@test.com",
                name: "Test", phone: "+966", date: "2026-08-15",
                startTime: "10:00", endTime: "11:00", totalAmount: "500",
            })
        ).rejects.toMatchObject({ message: "TABBY_NO_CHECKOUT_URL" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4–8. handleWebhook: payment.authorized
// ─────────────────────────────────────────────────────────────────────────────
describe("TabbyProvider.handleWebhook — payment.authorized", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates booking in DB after payment.authorized", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);   // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);   // conflict
        (prisma.booking.create as any).mockResolvedValue(makeBooking());

        const result = await new TabbyProvider().handleWebhook(
            webhook("payment.authorized", makePayment()), SIG
        );

        expect(prisma.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    serviceId: "service-abc",
                    clientEmail: "test@test.com",
                    startTime: "10:00",
                    endTime: "11:00",
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                    tabbyPaymentId: "pay_tabby_123",
                }),
            })
        );
        expect(result.received).toBe(true);
    });

    it("skips if payment already processed (idempotency)", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking()); // already in DB

        await new TabbyProvider().handleWebhook(webhook("payment.authorized", makePayment()), SIG);

        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it("closes payment when slot is already taken (race condition)", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);           // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking());  // conflict!
        tabbyOk({ id: "pay_tabby_123", status: "CLOSED" });

        await new TabbyProvider().handleWebhook(webhook("payment.authorized", makePayment()), SIG);

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("/close"),
            expect.objectContaining({ method: "POST" })
        );
        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it("rethrows DB error so Tabby retries the webhook", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);
        (prisma.booking.create as any).mockRejectedValue(new Error("DB timeout"));

        await expect(
            new TabbyProvider().handleWebhook(webhook("payment.authorized", makePayment()), SIG)
        ).rejects.toThrow("DB timeout");
    });

    it("skips gracefully when reference_id is missing", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);

        const result = await new TabbyProvider().handleWebhook(
            webhook("payment.authorized", { id: "pay_no_ref", order: {} }), SIG
        );

        expect(prisma.booking.create).not.toHaveBeenCalled();
        expect(result.received).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9–13. handleWebhook: other events + signature
// ─────────────────────────────────────────────────────────────────────────────
describe("TabbyProvider.handleWebhook — other events", () => {
    beforeEach(() => vi.clearAllMocks());

    it("handles payment.expired without creating booking", async () => {
        const result = await new TabbyProvider().handleWebhook(
            webhook("payment.expired", { id: "pay_tabby_123" }), SIG
        );
        expect(prisma.booking.create).not.toHaveBeenCalled();
        expect(result.received).toBe(true);
    });

    it("updates paymentStatus to PAID on payment.closed", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking({ paymentStatus: "AUTHORIZED" }));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));

        await new TabbyProvider().handleWebhook(
            webhook("payment.closed", { id: "pay_tabby_123" }), SIG
        );

        expect(prisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "PAID" }) })
        );
    });

    it("skips payment.closed if booking already PAID (idempotent)", async () => {
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking({ paymentStatus: "PAID" }));

        await new TabbyProvider().handleWebhook(
            webhook("payment.closed", { id: "pay_tabby_123" }), SIG
        );

        expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("throws INVALID_WEBHOOK_SIGNATURE when signature is wrong", async () => {
        await expect(
            new TabbyProvider().handleWebhook(Buffer.from("{}"), "wrong-secret")
        ).rejects.toMatchObject({ message: "INVALID_WEBHOOK_SIGNATURE" });
    });

    it("throws INVALID_WEBHOOK_PAYLOAD for malformed JSON", async () => {
        await expect(
            new TabbyProvider().handleWebhook(Buffer.from("not-json"), SIG)
        ).rejects.toMatchObject({ message: "INVALID_WEBHOOK_PAYLOAD" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14–16. capture
// ─────────────────────────────────────────────────────────────────────────────
describe("TabbyProvider.capture", () => {
    beforeEach(() => vi.clearAllMocks());

    it("captures full amount and sets paymentStatus to PAID", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking());
        mockFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "pay_tabby_123", status: "AUTHORIZED" }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "capture_123" }) });
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));

        const result = await new TabbyProvider().capture("booking-123");

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("/captures"),
            expect.objectContaining({ method: "POST" })
        );
        expect(prisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "PAID" }) })
        );
        expect(result.success).toBe(true);
        expect(result.provider).toBe("TABBY");
    });

    it("throws TABBY_NO_PAYMENT_ID when tabbyPaymentId is missing", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ tabbyPaymentId: null }));

        await expect(new TabbyProvider().capture("booking-123"))
            .rejects.toMatchObject({ message: "TABBY_NO_PAYMENT_ID" });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws TABBY_PAYMENT_NOT_CAPTURABLE when payment is CLOSED on Tabby", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking());
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "pay_tabby_123", status: "CLOSED" }) });

        await expect(new TabbyProvider().capture("booking-123"))
            .rejects.toMatchObject({ message: "TABBY_PAYMENT_NOT_CAPTURABLE" });
        expect(mockFetch).toHaveBeenCalledTimes(1); // only GET, no POST captures
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17–20. cancel
// ─────────────────────────────────────────────────────────────────────────────
describe("TabbyProvider.cancel", () => {
    beforeEach(() => vi.clearAllMocks());

    it("closes payment (void) when paymentStatus is AUTHORIZED → RELEASED", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentStatus: "AUTHORIZED" }));
        tabbyOk({ id: "pay_tabby_123", status: "CLOSED" });
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ status: "CANCELLED", paymentStatus: "RELEASED" }));

        const result = await new TabbyProvider().cancel("booking-123");

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("/close"), expect.objectContaining({ method: "POST" })
        );
        expect(result.status).toBe("released");
        expect(prisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", paymentStatus: "RELEASED" }) })
        );
    });

    it("issues full refund when paymentStatus is PAID → REFUNDED", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));
        tabbyOk({ id: "refund_tabby_123" });
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ status: "CANCELLED", paymentStatus: "REFUNDED" }));

        const result = await new TabbyProvider().cancel("booking-123");

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining("/refunds"), expect.objectContaining({ method: "POST" })
        );
        expect(result.status).toBe("refunded");
        expect(result.refundId).toBe("refund_tabby_123");
    });

    it("cancels in DB only when no tabbyPaymentId", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ tabbyPaymentId: null, paymentStatus: "UNPAID" }));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ status: "CANCELLED" }));

        const result = await new TabbyProvider().cancel("booking-123");

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.status).toBe("cancelled");
    });

    it("throws TABBY_INVALID_CANCEL_STATE for unexpected paymentStatus", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ tabbyPaymentId: "pay_tabby_123", paymentStatus: "RELEASED" })
        );

        await expect(new TabbyProvider().cancel("booking-123"))
            .rejects.toMatchObject({ message: "TABBY_INVALID_CANCEL_STATE" });
    });
});