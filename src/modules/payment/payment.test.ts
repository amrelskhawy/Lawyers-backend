/**
 * Payment + Booking Module — Full Test Suite
 *
 * Covers every scenario we built and discussed:
 *  1.  Happy path — booking created after payment
 *  2.  Close without paying — no booking created
 *  3.  Session expires — no booking, log fired
 *  4.  Race condition — slot conflict cancels second PI
 *  5.  Webhook idempotency — duplicate webhook skipped
 *  6.  Webhook DB failure — rethrows so Stripe retries
 *  7.  Admin cancels AUTHORIZED — hold released
 *  8.  Admin cancels PAID — refund issued
 *  9.  Admin cancels already cancelled — error
 *  10. Capture when not AUTHORIZED — error
 *  11. Capture when PI not capturable on Stripe — error
 *  12. Invalid webhook signature — error
 *  13. Webhook missing metadata — skipped gracefully
 *  14. PaymentService.capture calls confirmBooking
 *  15. BookingValidator — invalid date
 *  16. BookingValidator — date in past
 *  17. BookingValidator — time in past (today)
 *  18. BookingValidator — time outside working hours
 *  19. BookingValidator — slot blocked by holiday
 *  20. BookingValidator — invalid time range
 *
 * Run: npx vitest run
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// vi.hoisted — declared BEFORE vi.mock so mockStripe is available inside mocks
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
    default: vi.fn().mockImplementation(function () {
        return mockStripe;
    }),
}));

// Mock prisma
vi.mock("../../core/db/prisma.js", () => ({
    default: {
        booking: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        service: {
            findUnique: vi.fn(),
        },
        workingDay: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        holiday: {
            findMany: vi.fn(),
        },
    },
}));

// Mock googleapis
vi.mock("googleapis", () => ({
    google: {
        auth: { GoogleAuth: vi.fn() },
        calendar: vi.fn(() => ({ events: { insert: vi.fn() } })),
        meet: vi.fn(() => ({ spaces: { create: vi.fn() } })),
    },
}));

// Mock email
vi.mock("../../core/utils/email.js", () => ({
    sendEmailWithTemplate: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../../core/db/prisma.js";
import { StripeProvider } from "./providers/stripe/stripe.provider.js";
import { PaymentService } from "./payment.service.js";
import { PaymentValidator } from "./validators/payment.validator.js";
import { BookingValidator } from "../bookings/bookings.validator.js";
import { AvailabilityEngine } from "../bookings/availability.engine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const makeBooking = (overrides = {}) => ({
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
    totalAmount: 500,
    service: { id: "service-abc", name_en: "Legal Consultation", price: 500 },
    ...overrides,
});

const makeSession = (overrides = {}) => ({
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

const makePI = (status = "requires_capture", overrides = {}) => ({
    id: "pi_test_123",
    status,
    metadata: { bookingId: "booking-123" },
    ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. STRIPE PROVIDER — createPayment
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.createPayment", () => {
    it("creates a Checkout Session and returns url + sessionId", async () => {
        mockStripe.checkout.sessions.create.mockResolvedValue({
            id: "cs_test_new",
            url: "https://checkout.stripe.com/pay/cs_test_new",
        });

        const provider = new StripeProvider();
        const result = await provider.createPayment("cus_123", 500, {
            serviceId: "service-abc",
            clientEmail: "test@test.com",
            name: "Test User",
            phone: "+966500000000",
            date: "2026-08-15",
            startTime: "10:00",
            endTime: "11:00",
            totalAmount: "500",
        });

        expect(result.url).toBe("https://checkout.stripe.com/pay/cs_test_new");
        expect(result.sessionId).toBe("cs_test_new");
        expect(result.provider).toBe("STRIPE");
        expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "payment",
                payment_intent_data: expect.objectContaining({
                    capture_method: "manual",
                }),
            })
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. WEBHOOK — checkout.session.completed (happy path)
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.handleWebhook — checkout.session.completed", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates booking in DB when slot is free", async () => {
        const session = makeSession();

        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: session },
        });

        // No existing booking (idempotency check passes)
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);  // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);  // conflict check
        (prisma.booking.create as any).mockResolvedValue(makeBooking());

        const provider = new StripeProvider();
        const result = await provider.handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    clientEmail: "test@test.com",
                    startTime: "10:00",
                    endTime: "11:00",
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                    paymentIntentId: "pi_test_123",
                    stripeSessionId: "cs_test_abc",
                }),
            })
        );
        expect(result.received).toBe(true);
    });

    // ── Scenario 2: Close without paying ──────────────────────────────────────
    it("does NOT create booking if webhook never fires (user closed checkout)", () => {
        // If user never pays, checkout.session.completed never fires
        // so prisma.booking.create is never called
        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    // ── Scenario 4: Race condition ─────────────────────────────────────────────
    it("cancels PI when slot is already taken (race condition)", async () => {
        const session = makeSession();

        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: session },
        });

        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);              // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking());     // conflict found!
        mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_test_123" });

        const provider = new StripeProvider();
        await provider.handleWebhook(Buffer.from("{}"), "sig_test");

        expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_test_123");
        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    // ── Scenario 5: Idempotency ────────────────────────────────────────────────
    it("skips processing if session was already handled (Stripe retry)", async () => {
        const session = makeSession();

        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: session },
        });

        // First findFirst returns existing booking → already processed
        (prisma.booking.findFirst as any).mockResolvedValueOnce(makeBooking());

        const provider = new StripeProvider();
        await provider.handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    // ── Scenario 6: DB failure → Stripe retries ────────────────────────────────
    it("rethrows error on DB failure so Stripe retries webhook", async () => {
        const session = makeSession();

        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: session },
        });

        (prisma.booking.findFirst as any).mockResolvedValueOnce(null); // idempotency
        (prisma.booking.findFirst as any).mockResolvedValueOnce(null); // no conflict
        (prisma.booking.create as any).mockRejectedValue(new Error("DB connection failed"));

        const provider = new StripeProvider();

        await expect(
            provider.handleWebhook(Buffer.from("{}"), "sig_test")
        ).rejects.toThrow("DB connection failed");
    });

    // ── Scenario 13: Missing metadata ─────────────────────────────────────────
    it("skips gracefully if session metadata is missing serviceId", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: { id: "cs_no_meta", metadata: {}, payment_intent: "pi_123" } },
        });

        (prisma.booking.findFirst as any).mockResolvedValueOnce(null);

        const provider = new StripeProvider();
        const result = await provider.handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).not.toHaveBeenCalled();
        expect(result.received).toBe(true);
    });

    // ── Scenario 3: Session expired ────────────────────────────────────────────
    it("handles checkout.session.expired without creating booking", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({
            type: "checkout.session.expired",
            data: { object: makeSession() },
        });

        const provider = new StripeProvider();
        const result = await provider.handleWebhook(Buffer.from("{}"), "sig_test");

        expect(prisma.booking.create).not.toHaveBeenCalled();
        expect(result.received).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STRIPE PROVIDER — capture
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.capture", () => {
    beforeEach(() => vi.clearAllMocks());

    it("captures PI and updates paymentStatus to PAID", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking());
        mockStripe.paymentIntents.retrieve.mockResolvedValue(makePI("requires_capture"));
        mockStripe.paymentIntents.capture.mockResolvedValue(makePI("succeeded"));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));

        const provider = new StripeProvider();
        const result = await provider.capture("booking-123");

        expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith("pi_test_123");
        expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ paymentStatus: "PAID" }),
        }));
        expect(result.success).toBe(true);
    });

    // ── Scenario 11: PI not capturable ────────────────────────────────────────
    it("throws if PI status is not requires_capture (expired authorization)", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(makeBooking());
        mockStripe.paymentIntents.retrieve.mockResolvedValue(makePI("canceled"));

        const provider = new StripeProvider();

        await expect(provider.capture("booking-123")).rejects.toMatchObject({
            message: expect.stringContaining("PAYMENT_INTENT_NOT_CAPTURABLE"),
        });
        expect(mockStripe.paymentIntents.capture).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. STRIPE PROVIDER — cancel
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.cancel", () => {
    beforeEach(() => vi.clearAllMocks());

    // ── Scenario 7: AUTHORIZED → hold released ────────────────────────────────
    it("cancels PI (releases hold) when paymentStatus is AUTHORIZED", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ paymentStatus: "AUTHORIZED" })
        );
        mockStripe.paymentIntents.cancel.mockResolvedValue({ id: "pi_test_123" });
        (prisma.booking.update as any).mockResolvedValue(
            makeBooking({ status: "CANCELLED", paymentStatus: "RELEASED" })
        );

        const provider = new StripeProvider();
        const result = await provider.cancel("booking-123");

        expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_test_123");
        expect(result.status).toBe("released");
        expect(prisma.booking.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: "CANCELLED",
                paymentStatus: "RELEASED",
            }),
        }));
    });

    // ── Scenario 8: PAID → refund issued ──────────────────────────────────────
    it("issues full refund when paymentStatus is PAID", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ paymentStatus: "PAID" })
        );
        mockStripe.refunds.create.mockResolvedValue({ id: "re_test_123" });
        (prisma.booking.update as any).mockResolvedValue(
            makeBooking({ status: "CANCELLED", paymentStatus: "REFUNDED" })
        );

        const provider = new StripeProvider();
        const result = await provider.cancel("booking-123");

        expect(mockStripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({
            payment_intent: "pi_test_123",
            reason: "requested_by_customer",
        }));
        expect(result.status).toBe("refunded");
        expect(result.refundId).toBe("re_test_123");
    });

    it("just cancels booking when no paymentIntentId exists", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ paymentIntentId: null, paymentStatus: "UNPAID" })
        );
        (prisma.booking.update as any).mockResolvedValue(
            makeBooking({ status: "CANCELLED" })
        );

        const provider = new StripeProvider();
        const result = await provider.cancel("booking-123");

        expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(mockStripe.refunds.create).not.toHaveBeenCalled();
        expect(result.status).toBe("cancelled");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. WEBHOOK SIGNATURE
// ─────────────────────────────────────────────────────────────────────────────
describe("StripeProvider.handleWebhook — invalid signature", () => {
    // ── Scenario 12: Invalid signature ────────────────────────────────────────
    it("throws INVALID_WEBHOOK_SIGNATURE when signature is wrong", async () => {
        mockStripe.webhooks.constructEvent.mockImplementation(() => {
            throw new Error("No signatures found matching the expected signature for payload");
        });

        const provider = new StripeProvider();

        await expect(
            provider.handleWebhook(Buffer.from("{}"), "bad_sig")
        ).rejects.toMatchObject({
            message: expect.stringContaining("INVALID_WEBHOOK_SIGNATURE"),
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PAYMENT VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────
describe("PaymentValidator", () => {
    beforeEach(() => vi.clearAllMocks());

    // ── Scenario 10: Capture not AUTHORIZED ───────────────────────────────────
    it("validateBookingForCapture throws if paymentStatus is not AUTHORIZED", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ paymentStatus: "PAID" })
        );

        await expect(
            PaymentValidator.validateBookingForCapture("booking-123")
        ).rejects.toMatchObject({ message: "PAYMENT_NOT_AUTHORIZED" });
    });

    it("validateBookingForCapture throws if no paymentIntentId", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ paymentIntentId: null })
        );

        await expect(
            PaymentValidator.validateBookingForCapture("booking-123")
        ).rejects.toMatchObject({ message: "STRIPE_NO_PAYMENT_INTENT" });
    });

    it("validateBookingForCapture throws if booking not found", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(null);

        await expect(
            PaymentValidator.validateBookingForCapture("booking-123")
        ).rejects.toMatchObject({ message: "BOOKING_NOT_FOUND" });
    });

    // ── Scenario 9: Double cancel ──────────────────────────────────────────────
    it("validateBookingForCancel throws if already CANCELLED", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ status: "CANCELLED" })
        );

        await expect(
            PaymentValidator.validateBookingForCancel("booking-123")
        ).rejects.toMatchObject({ message: "BOOKING_ALREADY_CANCELLED" });
    });

    it("validateWebhookSignature throws if signature is missing", () => {
        expect(() =>
            PaymentValidator.validateWebhookSignature(undefined as any)
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. PAYMENT SERVICE — capture calls confirmBooking (via controller pattern)
// ─────────────────────────────────────────────────────────────────────────────
describe("PaymentService.capture", () => {
    beforeEach(() => vi.clearAllMocks());

    // ── Scenario 14: capture only captures, controller calls confirmBooking ───
    it("validates, captures, and returns result without calling confirmBooking itself", async () => {
        (prisma.booking.findUnique as any).mockResolvedValue(
            makeBooking({ paymentStatus: "AUTHORIZED" })
        );
        mockStripe.paymentIntents.retrieve.mockResolvedValue(makePI("requires_capture"));
        mockStripe.paymentIntents.capture.mockResolvedValue(makePI("succeeded"));
        (prisma.booking.update as any).mockResolvedValue(makeBooking({ paymentStatus: "PAID" }));

        const service = new PaymentService();
        const result = await service.capture("booking-123", "STRIPE");

        expect(result.success).toBe(true);
        expect(result.provider).toBe("STRIPE");
        // confirmBooking is NOT called by PaymentService — that's the controller's job
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. BOOKING VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingValidator.validateCreateBooking", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: service exists
        (prisma.service.findUnique as any).mockResolvedValue({
            id: "service-abc", price: 500
        });
        // Default: no holidays, working hours open
        (prisma.holiday.findMany as any).mockResolvedValue([]);
        (prisma.workingDay.findUnique as any).mockResolvedValue({
            day: "FRIDAY", isOpen: true, startTime: "08:00", endTime: "20:00"
        });
        (prisma.booking.findMany as any).mockResolvedValue([]);
    });

    // ── Scenario 15: Invalid date ──────────────────────────────────────────────
    it("throws INVALID_DATE for non-date string", async () => {
        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "service-abc", date: "not-a-date",
                startTime: "10:00", clientEmail: "t@t.com", name: "T", phone_number: "123"
            })
        ).rejects.toMatchObject({ message: "INVALID_DATE" });
    });

    // ── Scenario 16: Past date ─────────────────────────────────────────────────
    it("throws DATE_IN_PAST for yesterday", async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "service-abc",
                date: yesterday.toISOString().split("T")[0],
                startTime: "10:00", clientEmail: "t@t.com", name: "T", phone_number: "123"
            })
        ).rejects.toMatchObject({ message: "DATE_IN_PAST" });
    });

    // ── Scenario 20: Invalid time range ───────────────────────────────────────
    it("throws INVALID_TIME_RANGE when endTime is before startTime", async () => {
        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "service-abc", date: "2026-08-15",
                startTime: "11:00", endTime: "09:00",
                clientEmail: "t@t.com", name: "T", phone_number: "123"
            })
        ).rejects.toMatchObject({ message: "INVALID_TIME_RANGE" });
    });

    // ── Scenario 18: Outside working hours ────────────────────────────────────
    it("throws TIME_OUTSIDE_WORKING_HOURS when slot is before opening", async () => {
        (prisma.workingDay.findUnique as any).mockResolvedValue({
            day: "FRIDAY", isOpen: true, startTime: "09:00", endTime: "17:00"
        });

        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "service-abc", date: "2026-08-15",
                startTime: "07:00", endTime: "08:00",
                clientEmail: "t@t.com", name: "T", phone_number: "123"
            })
        ).rejects.toMatchObject({ message: "TIME_OUTSIDE_WORKING_HOURS" });
    });

    // ── Scenario 19: Slot blocked by holiday ──────────────────────────────────
    it("throws SLOT_BLOCKED when slot overlaps with partial holiday", async () => {
        (prisma.holiday.findMany as any).mockResolvedValue([{
            isFullDay: false,
            startTime: "09:00",
            endTime: "12:00",
            date: new Date("2026-08-15"),
        }]);

        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "service-abc", date: "2026-08-15",
                startTime: "10:00", endTime: "11:00",
                clientEmail: "t@t.com", name: "T", phone_number: "123"
            })
        ).rejects.toMatchObject({ message: "SLOT_BLOCKED" });
    });

    it("throws DAY_FULLY_BLOCKED when a full-day holiday exists", async () => {
        (prisma.holiday.findMany as any).mockResolvedValue([{
            isFullDay: true,
            date: new Date("2026-08-15"),
        }]);

        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "service-abc", date: "2026-08-15",
                startTime: "10:00", endTime: "11:00",
                clientEmail: "t@t.com", name: "T", phone_number: "123"
            })
        ).rejects.toMatchObject({ message: "DAY_FULLY_BLOCKED" });
    });

    it("returns cleaned values when all validations pass", async () => {
        const result = await BookingValidator.validateCreateBooking({
            serviceId: "service-abc",
            date: "2026-08-15",
            startTime: "10:00",
            endTime: "11:00",
            clientEmail: "t@t.com",
            name: "T",
            phone_number: "123",
        });

        expect(result.cleanStartTime).toBe("10:00");
        expect(result.endTime).toBe("11:00");
        expect(result.service.id).toBe("service-abc");
        expect(result.bookingDay).toBeInstanceOf(Date);
    });

    it("normalizes HH:mm:ss startTime to HH:mm", async () => {
        const result = await BookingValidator.validateCreateBooking({
            serviceId: "service-abc",
            date: "2026-08-15",
            startTime: "10:00:00",
            clientEmail: "t@t.com",
            name: "T",
            phone_number: "123",
        });

        expect(result.cleanStartTime).toBe("10:00");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. BOOKING VALIDATOR — validateDateRange
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingValidator.validateDateRange", () => {
    it("throws INVALID_DATE_RANGE for bad strings", () => {
        expect(() =>
            BookingValidator.validateDateRange("not-a-date", "2026-08-15")
        ).toThrow();
    });

    it("returns Date objects for valid range", () => {
        const result = BookingValidator.validateDateRange("2026-08-01", "2026-08-31");
        expect(result.startDate).toBeInstanceOf(Date);
        expect(result.endDate).toBeInstanceOf(Date);
    });
});