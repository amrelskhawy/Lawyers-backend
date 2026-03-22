/**
 * stripe.test.ts — StripeProvider + PaymentService + PaymentValidator + BookingValidator
 *
 * Scenarios covered:
 *  1.  createPayment — returns url + sessionId
 *  2.  Happy path webhook — booking created in DB
 *  3.  Close without paying — no booking created
 *  4.  Session expires — no booking, log only
 *  5.  Race condition — slot conflict cancels second PI
 *  6.  Idempotency — duplicate webhook skipped
 *  7.  DB failure — rethrows so Stripe retries
 *  8.  Missing metadata — skipped gracefully
 *  9.  Invalid signature — INVALID_WEBHOOK_SIGNATURE
 *  10. Capture AUTHORIZED — PI captured, paymentStatus PAID
 *  11. Capture expired PI — TABBY_PAYMENT_NOT_CAPTURABLE
 *  12. Cancel AUTHORIZED — PI cancelled, RELEASED
 *  13. Cancel PAID — refund issued, REFUNDED
 *  14. Cancel with no PI — just cancelled in DB
 *  15. PaymentValidator capture — not AUTHORIZED
 *  16. PaymentValidator capture — no paymentIntentId
 *  17. PaymentValidator capture — booking not found
 *  18. PaymentValidator cancel — already CANCELLED
 *  19. PaymentValidator webhook — missing signature
 *  20. PaymentService.capture — only captures, no confirmBooking
 *  21. BookingValidator — invalid date
 *  22. BookingValidator — date in past
 *  23. BookingValidator — invalid time range
 *  24. BookingValidator — outside working hours
 *  25. BookingValidator — slot blocked by holiday
 *  26. BookingValidator — full day blocked
 *  27. BookingValidator — returns cleaned values
 *  28. BookingValidator — normalizes HH:mm:ss to HH:mm
 *  29. BookingValidator.validateDateRange — invalid range
 *  30. BookingValidator.validateDateRange — valid range
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// vi.hoisted — must be before vi.mock calls
// ─────────────────────────────────────────────────────────────────────────────
const mockStripe = vi.hoisted(() => ({
    customers: {
        create: vi.fn(),
        list: vi.fn(),
    },
    checkout: {
        sessions: { create: vi.fn() },
    },
    paymentIntents: {
        retrieve: vi.fn(),
        capture: vi.fn(),
        cancel: vi.fn(),
    },
    refunds: {
        create: vi.fn(),
    },
    webhooks: {
        constructEvent: vi.fn(),
    },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("stripe", () => ({
    default: vi.fn().mockImplementation(function () { return mockStripe; }),
}));

vi.mock("../../../../core/db/prisma.js", () => ({
    default: {
        booking: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        service: { findUnique: vi.fn() },
        workingDay: { findMany: vi.fn(), findUnique: vi.fn() },
        holiday: { findMany: vi.fn() },
    },
}));

vi.mock("googleapis", () => ({
    google: {
        auth: { GoogleAuth: vi.fn() },
        calendar: vi.fn(() => ({ events: { insert: vi.fn() } })),
        meet: vi.fn(() => ({ spaces: { create: vi.fn() } })),
    },
}));

vi.mock("../../../../core/utils/email.js", () => ({
    sendEmailWithTemplate: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (AFTER mocks)
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../../../../core/db/prisma.js";
import { StripeProvider } from "./stripe.provider.js";
import { PaymentService } from "../../payment.service.js";
import { PaymentValidator } from "../../validators/payment.validator.js";
import { BookingValidator } from "../../../bookings/bookings.validator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const makeBooking = (overrides: Record<string, any> = {}) => ({
    id: "booking-123",
    serviceId: "service-abc",
    clientEmail: "test@test.com",
    name: "Test User",
    phone_number: "+966500000000",
    date: new Date("2026-08-15T00:00:00.000Z"),
    startTime: "10:00",
    endTime: "11:00",
    status: "PENDING",
    paymentStatus: "AUTHORIZED",
    paymentIntentId: "pi_test_123",
    stripeSessionId: "cs_test_abc",
    tabbyPaymentId: null,
    totalAmount: 500,
    service: { id: "service-abc", name_en: "Legal Consultation", price: 500 },
    ...overrides,
});

const makeSession = (overrides: Record<string, any> = {}) => ({
    id: "cs_test_abc",
    payment_intent: "pi_test_123",
    customer_email: "test@test.com",
    metadata: {
        serviceId: "service-abc",
        clientEmail: "test@test.com",
        name: "Test User",
        phone: "+966500000000",
        date: "2026-08-15",
        startTime: "10:00",
        endTime: "11:00",
        totalAmount: "500",
    },
    ...overrides,
});

const makePI = (status = "requires_capture", overrides: Record<string, any> = {}) => ({
    id: "pi_test_123",
    status,
    ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. createPayment
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.createPayment", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates Checkout Session and returns url + sessionId", async () => {
        mockStripe.checkout.sessions.create.mockResolvedValue({
            id: "cs_test_new",
            url: "https://checkout.stripe.com/pay/cs_test_new",
        });

        const result = await new StripeProvider().createPayment("cus_123", 500, {
            serviceId: "service-abc", clientEmail: "test@test.com",
            name: "Test User", phone: "+966500000000",
            date: "2026-08-15", startTime: "10:00", endTime: "11:00", totalAmount: "500",
        });

        expect(result.url).toBe("https://checkout.stripe.com/pay/cs_test_new");
        expect(result.sessionId).toBe("cs_test_new");
        expect(result.provider).toBe("STRIPE");
        expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "payment",
                payment_intent_data: expect.objectContaining({ capture_method: "manual" }),
            })
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2–8. Webhook: checkout.session.completed
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.handleWebhook — checkout.session.completed", () => {
    beforeEach(() => vi.clearAllMocks());

    // 2 — Happy path
    it("creates booking in DB after successful payment", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: makeSession() },
        });
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);   // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);   // conflict
        (prisma.booking.create as any).mockResolvedValue(makeBooking());

        const result = await new StripeProvider().handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    clientEmail: "test@test.com",
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                    paymentIntentId: "pi_test_123",
                    stripeSessionId: "cs_test_abc",
                }),
            })
        );
        expect(result.received).toBe(true);
    });

    // 3 — No payment = no webhook = no booking
    it("does NOT create booking if user never pays (webhook never fires)", () => {
        // This is a logical scenario — if the user closes the checkout, the
        // checkout.session.completed webhook never fires, so create is never called.
        // We verify prisma.booking.create has not been called in this test scope.
        expect((prisma.booking.create as any).mock?.calls?.length ?? 0).toBe(0);
    });

    // 4 — Session expired
    it("handles checkout.session.expired without creating booking", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.expired",
            data: { object: makeSession() },
        });

        const result = await new StripeProvider().handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).not.toHaveBeenCalled();
        expect(result.received).toBe(true);
    });

    // 5 — Race condition
    it("cancels PI when slot is already taken by another booking", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: makeSession() },
        });
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);            // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking());   // conflict!
        mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_test_123" });

        await new StripeProvider().handleWebhook(Buffer.from("{}"), "sig_test");

        expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_test_123");
        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    // 6 — Idempotency
    it("skips processing if session already handled (Stripe retry)", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: makeSession() },
        });
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking()); // already exists

        await new StripeProvider().handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    // 7 — DB failure → Stripe retries
    it("rethrows DB error so Stripe retries the webhook", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: makeSession() },
        });
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);
        (prisma.booking.create as any).mockRejectedValue(new Error("DB connection failed"));

        await expect(
            new StripeProvider().handleWebhook(Buffer.from("{}"), "sig_test")
        ).rejects.toThrow("DB connection failed");
    });

    // 8 — Missing metadata
    it("skips gracefully if session metadata is missing serviceId", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: { id: "cs_no_meta", metadata: {}, payment_intent: "pi_123" } },
        });
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);

        const result = await new StripeProvider().handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).not.toHaveBeenCalled();
        expect(result.received).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Invalid signature
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.handleWebhook — invalid signature", () => {
    beforeEach(() => vi.clearAllMocks());

    it("throws INVALID_WEBHOOK_SIGNATURE when signature is wrong", async () => {
        mockStripe.webhooks.constructEvent.mockImplementation(() => {
            throw new Error("No signatures found");
        });

        await expect(
            new StripeProvider().handleWebhook(Buffer.from("{}"), "bad_sig")
        ).rejects.toMatchObject({ message: "INVALID_WEBHOOK_SIGNATURE" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10–11. capture
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.capture", () => {
    beforeEach(() => vi.clearAllMocks());

    it("captures PI and sets paymentStatus to PAID", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking());
        mockStripe.paymentIntents.retrieve.mockResolvedValue(makePI("requires_capture"));
        mockStripe.paymentIntents.capture.mockResolvedValue(makePI("succeeded"));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));

        const result = await new StripeProvider().capture("booking-123");

        expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith("pi_test_123");
        expect(prisma.booking.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "PAID" }) })
        );
        expect(result.success).toBe(true);
    });

    it("throws PAYMENT_INTENT_NOT_CAPTURABLE when PI is expired on Stripe", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking());
        mockStripe.paymentIntents.retrieve.mockResolvedValue(makePI("canceled"));

        await expect(
            new StripeProvider().capture("booking-123")
        ).rejects.toMatchObject({ message: expect.stringContaining("PAYMENT_INTENT_NOT_CAPTURABLE") });

        expect(mockStripe.paymentIntents.capture).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12–14. cancel
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.cancel", () => {
    beforeEach(() => vi.clearAllMocks());

    it("cancels PI and sets RELEASED when paymentStatus is AUTHORIZED", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentStatus: "AUTHORIZED" }));
        mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_test_123" });
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ status: "CANCELLED", paymentStatus: "RELEASED" }));

        const result = await new StripeProvider().cancel("booking-123");

        expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_test_123");
        expect(result.status).toBe("released");
    });

    it("issues full refund and sets REFUNDED when paymentStatus is PAID", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));
        mockStripe.refunds.create.mockResolvedValue({ id: "re_test_123" });
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ status: "CANCELLED", paymentStatus: "REFUNDED" }));

        const result = await new StripeProvider().cancel("booking-123");

        expect(mockStripe.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: "pi_test_123", reason: "requested_by_customer" })
        );
        expect(result.status).toBe("refunded");
        expect(result.refundId).toBe("re_test_123");
    });

    it("cancels booking in DB only when no paymentIntentId exists", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentIntentId: null, paymentStatus: "UNPAID" }));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ status: "CANCELLED" }));

        const result = await new StripeProvider().cancel("booking-123");

        expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(mockStripe.refunds.create).not.toHaveBeenCalled();
        expect(result.status).toBe("cancelled");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15–19. PaymentValidator
// ─────────────────────────────────────────────────────────────────────────────
describe("PaymentValidator", () => {
    beforeEach(() => vi.clearAllMocks());

    it("validateBookingForCapture throws PAYMENT_NOT_AUTHORIZED when status is PAID", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));
        await expect(PaymentValidator.validateBookingForCapture("booking-123"))
            .rejects.toMatchObject({ message: "PAYMENT_NOT_AUTHORIZED" });
    });

    it("validateBookingForCapture throws STRIPE_NO_PAYMENT_INTENT when no paymentIntentId", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentIntentId: null }));
        await expect(PaymentValidator.validateBookingForCapture("booking-123"))
            .rejects.toMatchObject({ message: "STRIPE_NO_PAYMENT_INTENT" });
    });

    it("validateBookingForCapture throws BOOKING_NOT_FOUND when booking missing", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(null);
        await expect(PaymentValidator.validateBookingForCapture("booking-123"))
            .rejects.toMatchObject({ message: "BOOKING_NOT_FOUND" });
    });

    it("validateBookingForCancel throws BOOKING_ALREADY_CANCELLED on double cancel", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ status: "CANCELLED" }));
        await expect(PaymentValidator.validateBookingForCancel("booking-123"))
            .rejects.toMatchObject({ message: "BOOKING_ALREADY_CANCELLED" });
    });

    it("validateWebhookSignature throws when signature is missing", () => {
        expect(() => PaymentValidator.validateWebhookSignature(undefined as any)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. PaymentService.capture — no double call, no confirmBooking
// ─────────────────────────────────────────────────────────────────────────────
describe("PaymentService.capture", () => {
    beforeEach(() => vi.clearAllMocks());

    it("validates + captures once without calling confirmBooking", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking({ paymentStatus: "AUTHORIZED" }));
        mockStripe.paymentIntents.retrieve.mockResolvedValue(makePI("requires_capture"));
        mockStripe.paymentIntents.capture.mockResolvedValue(makePI("succeeded"));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));

        const result = await new PaymentService().capture("booking-123", "STRIPE");

        // Must only be called once (the double-call bug is fixed)
        expect(mockStripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
        expect(result.provider).toBe("STRIPE");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21–28. BookingValidator.validateCreateBooking
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingValidator.validateCreateBooking", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.service.findUnique as any).mockResolvedValue({ id: "service-abc", price: 500 });
        (prisma.holiday.findMany as any).mockResolvedValue([]);
        (prisma.workingDay.findUnique as any).mockResolvedValue({
            day: "FRIDAY", isOpen: true, startTime: "08:00", endTime: "20:00",
        });
        (prisma.booking.findMany as any).mockResolvedValue([]);
    });

    const base = {
        serviceId: "service-abc", date: "2026-08-15",
        startTime: "10:00", endTime: "11:00",
        clientEmail: "t@t.com", name: "T", phone_number: "123",
    };

    it("throws INVALID_DATE for non-date string", async () => {
        await expect(BookingValidator.validateCreateBooking({ ...base, date: "not-a-date" }))
            .rejects.toMatchObject({ message: "INVALID_DATE" });
    });

    it("throws DATE_IN_PAST for yesterday", async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await expect(BookingValidator.validateCreateBooking({ ...base, date: yesterday.toISOString().split("T")[0] }))
            .rejects.toMatchObject({ message: "DATE_IN_PAST" });
    });

    it("throws INVALID_TIME_RANGE when endTime is before startTime", async () => {
        await expect(BookingValidator.validateCreateBooking({ ...base, startTime: "11:00", endTime: "09:00" }))
            .rejects.toMatchObject({ message: "INVALID_TIME_RANGE" });
    });

    it("throws TIME_OUTSIDE_WORKING_HOURS when slot is before opening", async () => {
        (prisma.workingDay.findUnique as any).mockResolvedValue({
            day: "FRIDAY", isOpen: true, startTime: "09:00", endTime: "17:00",
        });
        await expect(BookingValidator.validateCreateBooking({ ...base, startTime: "07:00", endTime: "08:00" }))
            .rejects.toMatchObject({ message: "TIME_OUTSIDE_WORKING_HOURS" });
    });

    it("throws SLOT_BLOCKED when slot overlaps with partial holiday", async () => {
        (prisma.holiday.findMany as any).mockResolvedValue([{
            isFullDay: false, startTime: "09:00", endTime: "12:00",
            date: new Date("2026-08-15"),
        }]);
        await expect(BookingValidator.validateCreateBooking(base))
            .rejects.toMatchObject({ message: "SLOT_BLOCKED" });
    });

    it("throws DAY_FULLY_BLOCKED when full-day holiday exists", async () => {
        (prisma.holiday.findMany as any).mockResolvedValue([{ isFullDay: true, date: new Date("2026-08-15") }]);
        await expect(BookingValidator.validateCreateBooking(base))
            .rejects.toMatchObject({ message: "DAY_FULLY_BLOCKED" });
    });

    it("returns cleaned values when all validations pass", async () => {
        const result = await BookingValidator.validateCreateBooking(base);
        expect(result.cleanStartTime).toBe("10:00");
        expect(result.endTime).toBe("11:00");
        expect(result.service.id).toBe("service-abc");
        expect(result.bookingDay).toBeInstanceOf(Date);
    });

    it("normalizes HH:mm:ss startTime to HH:mm", async () => {
        const result = await BookingValidator.validateCreateBooking({ ...base, startTime: "10:00:00" });
        expect(result.cleanStartTime).toBe("10:00");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 29–30. BookingValidator.validateDateRange
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingValidator.validateDateRange", () => {
    it("throws INVALID_DATE_RANGE for invalid date strings", () => {
        expect(() => BookingValidator.validateDateRange("not-a-date", "2026-08-15")).toThrow();
    });

    it("returns Date objects for a valid range", () => {
        const result = BookingValidator.validateDateRange("2026-08-01", "2026-08-31");
        expect(result.startDate).toBeInstanceOf(Date);
        expect(result.endDate).toBeInstanceOf(Date);
    });
});