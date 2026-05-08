/**
 * paymob.test.ts — PaymobProvider full test suite
 *
 * Scenarios covered:
 *  1.  createPayment — returns checkout iframe URL + orderId
 *  2.  createPayment — throws PAYMOB_API_KEY_MISSING when env var absent
 *  3.  createPayment — throws PAYMOB_AUTH_FAILED when auth returns no token
 *  4.  Webhook — TRANSACTION success → booking created (happy path)
 *  5.  Webhook — TRANSACTION success → idempotency → skipped if already processed
 *  6.  Webhook — TRANSACTION success → race condition → immediate refund, no booking
 *  7.  Webhook — TRANSACTION success → DB failure → rethrows so Paymob retries
 *  8.  Webhook — TRANSACTION success → missing/invalid merchant_order_id → skipped
 *  9.  Webhook — TRANSACTION voided → booking marked RELEASED
 *  10. Webhook — TRANSACTION voided → idempotent if already RELEASED
 *  11. Webhook — TRANSACTION refunded → booking marked REFUNDED
 *  12. Webhook — TRANSACTION refunded → idempotent if already REFUNDED
 *  13. Webhook — invalid HMAC → INVALID_WEBHOOK_SIGNATURE
 *  14. Webhook — invalid JSON body → INVALID_WEBHOOK_PAYLOAD
 *  15. capture — happy path → marks booking PAID
 *  16. capture — throws PAYMOB_NO_ORDER_ID when paymobOrderId missing
 *  17. cancel AUTHORIZED → void → RELEASED
 *  18. cancel PAID → full refund → REFUNDED
 *  19. cancel with no paymobOrderId → just cancels in DB
 *  20. cancel with invalid paymentStatus → PAYMOB_INVALID_CANCEL_STATE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// vi.hoisted — mock fetch before anything runs
// ─────────────────────────────────────────────────────────────────────────────
const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("../../../../core/db/prisma.js", () => ({
    default: {
        booking: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

// ─────────────────────────────────────────────────────────────────────────────
// ENV setup
// ─────────────────────────────────────────────────────────────────────────────
const HMAC_SECRET = "paymob-test-hmac-secret";
process.env.PAYMOB_API_KEY = "test_api_key";
process.env.PAYMOB_INTEGRATION_ID = "123456";
process.env.PAYMOB_IFRAME_ID = "789";
process.env.PAYMOB_HMAC_SECRET = HMAC_SECRET;
process.env.PAYMOB_CURRENCY = "EGP";
process.env.PAYMOB_SUCCESS_URL = "https://example.com/success";
process.env.PAYMOB_CANCEL_URL = "https://example.com/cancel";
process.env.PAYMOB_BASE_URL = "https://accept.paymob.com";

import prisma from "../../../../core/db/prisma.js";
import { PaymobProvider } from "./paymob.provider.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockFetchJson(data: unknown, ok = true, status = 200) {
    mockFetch.mockResolvedValueOnce({
        ok,
        status,
        text: async () => JSON.stringify(data),
    });
}

const REFERENCE_ID = [
    "svc-1",
    "client@example.com",
    "John Doe",
    "+201234567890",
    "2025-01-15",
    "10:00",
    "11:00",
    "500",
].join("|");

function makeTransaction(overrides: Record<string, any> = {}) {
    return {
        id: "txn-001",
        amount_cents: 50000,
        created_at: "2025-01-15T10:00:00Z",
        currency: "EGP",
        error_occured: false,
        has_parent_transaction: false,
        integration_id: 123456,
        is_3d_secure: false,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: true,
        is_voided: false,
        order: { id: "order-001", merchant_order_id: REFERENCE_ID },
        owner: 1,
        pending: false,
        source_data: { pan: "1234", sub_type: "MasterCard", type: "card" },
        success: true,
        ...overrides,
    };
}

function buildHmac(transaction: Record<string, any>): string {
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
    ].join("");
    return crypto.createHmac("sha512", HMAC_SECRET).update(fields).digest("hex");
}

function makeWebhookBody(transaction: Record<string, any>, type = "TRANSACTION") {
    return Buffer.from(JSON.stringify({ type, obj: transaction }));
}

const mockCustomerService = {
    findOrCreateCustomerFromBooking: vi.fn().mockResolvedValue("cust-001"),
};

function makeProvider() {
    return new PaymobProvider(mockCustomerService as any);
}

const mockPrisma = prisma as any;

beforeEach(() => {
    vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// createPayment
// ─────────────────────────────────────────────────────────────────────────────

describe("createPayment", () => {
    it("1. returns checkout iframe URL + orderId", async () => {
        mockFetchJson({ token: "auth-token-abc" }); // auth
        mockFetchJson({ id: "order-001" }); // order
        mockFetchJson({ token: "payment-key-xyz" }); // payment key

        const provider = makeProvider();
        const result = await provider.createPayment("", 500, {
            serviceId: "svc-1",
            clientEmail: "client@example.com",
            name: "John Doe",
            phone: "+201234567890",
            date: "2025-01-15",
            startTime: "10:00",
            endTime: "11:00",
            totalAmount: "500",
        });

        expect(result.url).toContain("iframes/789?payment_token=payment-key-xyz");
        expect(result.paymentId).toBe("order-001");
        expect(result.provider).toBe("PAYMOB");
    });

    it("2. throws PAYMOB_API_KEY_MISSING when env var absent", async () => {
        const saved = process.env.PAYMOB_API_KEY;
        delete process.env.PAYMOB_API_KEY;

        const provider = makeProvider();
        await expect(
            provider.createPayment("", 500, {} as any)
        ).rejects.toMatchObject({ message: "PAYMOB_API_KEY_MISSING" });

        process.env.PAYMOB_API_KEY = saved;
    });

    it("3. throws PAYMOB_AUTH_FAILED when auth returns no token", async () => {
        mockFetchJson({ token: null }); // auth with no token

        const provider = makeProvider();
        await expect(
            provider.createPayment("", 500, {
                serviceId: "svc-1", clientEmail: "a@b.com", name: "X", phone: "1",
                date: "2025-01-15", startTime: "10:00", endTime: "11:00", totalAmount: "500",
            })
        ).rejects.toMatchObject({ message: "PAYMOB_AUTH_FAILED" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleWebhook — TRANSACTION success
// ─────────────────────────────────────────────────────────────────────────────

describe("handleWebhook — TRANSACTION success", () => {
    it("4. happy path → creates booking with AUTHORIZED status", async () => {
        const transaction = makeTransaction();
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce(null); // idempotency check
        mockPrisma.booking.findFirst.mockResolvedValueOnce(null); // race condition check
        mockPrisma.booking.create.mockResolvedValueOnce({
            id: "bk-001",
            service: { name_en: "Consultation" },
            customer: { email: "client@example.com" },
        });

        const provider = makeProvider();
        const result = await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(result.received).toBe(true);
        expect(mockPrisma.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paymentStatus: "AUTHORIZED",
                    paymobOrderId: "txn-001",
                }),
            })
        );
    });

    it("5. idempotency → skipped if already processed", async () => {
        const transaction = makeTransaction();
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: "bk-existing" });

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.create).not.toHaveBeenCalled();
    });

    it("6. race condition → immediate refund, no booking created", async () => {
        const transaction = makeTransaction();
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce(null); // idempotency
        mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: "conflicting-bk" }); // race condition

        // mock auth + refund API calls
        mockFetchJson({ token: "auth-token" });
        mockFetchJson({ id: "refund-001" });

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.create).not.toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalledTimes(2); // auth + refund
    });

    it("7. DB failure → rethrows so Paymob retries", async () => {
        const transaction = makeTransaction();
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce(null);
        mockPrisma.booking.findFirst.mockResolvedValueOnce(null);
        mockPrisma.booking.create.mockRejectedValueOnce(new Error("DB down"));

        const provider = makeProvider();
        await expect(provider.handleWebhook(makeWebhookBody(transaction), hmac)).rejects.toThrow("DB down");
    });

    it("8. missing merchant_order_id → skipped", async () => {
        const transaction = makeTransaction({ order: { id: "order-001", merchant_order_id: "" } });
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce(null);

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.create).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleWebhook — TRANSACTION voided / refunded
// ─────────────────────────────────────────────────────────────────────────────

describe("handleWebhook — TRANSACTION voided", () => {
    it("9. booking marked RELEASED", async () => {
        const transaction = makeTransaction({ success: false, is_voided: true });
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "AUTHORIZED" });
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "RELEASED" });

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ paymentStatus: "RELEASED", status: "CANCELLED" }),
            })
        );
    });

    it("10. idempotent if already RELEASED", async () => {
        const transaction = makeTransaction({ success: false, is_voided: true });
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "RELEASED" });

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });
});

describe("handleWebhook — TRANSACTION refunded", () => {
    it("11. booking marked REFUNDED", async () => {
        const transaction = makeTransaction({ success: true, is_refunded: true });
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "PAID" });
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "REFUNDED" });

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ paymentStatus: "REFUNDED", status: "CANCELLED" }),
            })
        );
    });

    it("12. idempotent if already REFUNDED", async () => {
        const transaction = makeTransaction({ success: true, is_refunded: true });
        const hmac = buildHmac(transaction);

        mockPrisma.booking.findFirst.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "REFUNDED" });

        const provider = makeProvider();
        await provider.handleWebhook(makeWebhookBody(transaction), hmac);

        expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleWebhook — signature / payload errors
// ─────────────────────────────────────────────────────────────────────────────

describe("handleWebhook — errors", () => {
    it("13. invalid HMAC → INVALID_WEBHOOK_SIGNATURE", async () => {
        const transaction = makeTransaction();
        const provider = makeProvider();
        await expect(
            provider.handleWebhook(makeWebhookBody(transaction), "bad-hmac")
        ).rejects.toMatchObject({ message: "INVALID_WEBHOOK_SIGNATURE" });
    });

    it("14. invalid JSON body → INVALID_WEBHOOK_PAYLOAD", async () => {
        const provider = makeProvider();
        await expect(
            provider.handleWebhook(Buffer.from("not-json"), "anything")
        ).rejects.toMatchObject({ message: "INVALID_WEBHOOK_PAYLOAD" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// capture
// ─────────────────────────────────────────────────────────────────────────────

describe("capture", () => {
    it("15. happy path → marks booking PAID", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "bk-001",
            paymobOrderId: "txn-001",
            totalAmount: "500",
            service: {},
        });
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "PAID" });

        const provider = makeProvider();
        const result = await provider.capture("bk-001");

        expect(result.success).toBe(true);
        expect(mockPrisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { paymentStatus: "PAID" } })
        );
    });

    it("16. throws PAYMOB_NO_ORDER_ID when paymobOrderId is missing", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "bk-001",
            paymobOrderId: null,
            service: {},
        });

        const provider = makeProvider();
        await expect(provider.capture("bk-001")).rejects.toMatchObject({ message: "PAYMOB_NO_ORDER_ID" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancel
// ─────────────────────────────────────────────────────────────────────────────

describe("cancel", () => {
    it("17. AUTHORIZED → void → RELEASED", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "bk-001",
            paymobOrderId: "txn-001",
            paymentStatus: "AUTHORIZED",
            totalAmount: "500",
            service: {},
        });
        mockFetchJson({ token: "auth-token" }); // auth
        mockFetchJson({ id: "void-001" }); // void
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "RELEASED" });

        const provider = makeProvider();
        const result = await provider.cancel("bk-001");

        expect(result.status).toBe("released");
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("18. PAID → full refund → REFUNDED", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "bk-001",
            paymobOrderId: "txn-001",
            paymentStatus: "PAID",
            totalAmount: "500",
            serviceId: "svc-1",
            service: {},
        });
        mockFetchJson({ token: "auth-token" }); // auth
        mockFetchJson({ id: "refund-001" }); // refund
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "bk-001", paymentStatus: "REFUNDED" });

        const provider = makeProvider();
        const result = await provider.cancel("bk-001");

        expect(result.status).toBe("refunded");
        expect(result.refundId).toBe("refund-001");
    });

    it("19. no paymobOrderId → just cancels in DB", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "bk-001",
            paymobOrderId: null,
            paymentStatus: "UNPAID",
            service: {},
        });
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "bk-001", status: "CANCELLED" });

        const provider = makeProvider();
        const result = await provider.cancel("bk-001");

        expect(result.status).toBe("cancelled");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("20. invalid paymentStatus → PAYMOB_INVALID_CANCEL_STATE", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "bk-001",
            paymobOrderId: "txn-001",
            paymentStatus: "UNPAID",
            totalAmount: "500",
            service: {},
        });
        mockFetchJson({ token: "auth-token" }); // auth still called

        const provider = makeProvider();
        await expect(provider.cancel("bk-001")).rejects.toMatchObject({
            message: "PAYMOB_INVALID_CANCEL_STATE",
        });
    });
});
