/**
 * bookings.validator.test.ts — validateCreateBooking installment behavior
 *
 * Scenarios covered:
 *  1. Installment-plan service → short-circuits, returns null date/time, no date checks
 *  2. Installment-plan service with NO date/startTime in payload → still succeeds
 *  3. Missing service → SERVICE_NOT_FOUND
 *  4. Non-installment service with invalid date → INVALID_DATE (regression)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    default: {
        service: { findUnique: vi.fn() },
        booking: { findFirst: vi.fn() },
    },
}));

vi.mock("../../core/db/prisma.js", () => prismaMock);

// The availability engine must never be consulted for installment bookings.
const isDayFullyBlocked = vi.hoisted(() => vi.fn());
vi.mock("../availability/index.js", () => ({
    AvailabilityEngine: class {
        isDayFullyBlocked = isDayFullyBlocked;
        getWorkingHours = vi.fn();
        isSlotBlocked = vi.fn();
    },
}));

import { BookingValidator } from "./bookings.validator.js";

const installmentService = { id: "svc-1", isInstallmentPlans: true, price: 500, name_en: "Plan" };
const normalService = { id: "svc-2", isInstallmentPlans: false, price: 300, name_en: "Consult" };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("validateCreateBooking — installment plans", () => {
    it("short-circuits for installment services and returns null date/time", async () => {
        prismaMock.default.service.findUnique.mockResolvedValue(installmentService);

        const result = await BookingValidator.validateCreateBooking({
            serviceId: "svc-1",
            date: "2026-08-01",
            startTime: "10:00",
        });

        expect(result).toEqual({
            bookingDay: null,
            cleanStartTime: null,
            endTime: null,
            service: installmentService,
        });
        // No availability checks for a dateless booking.
        expect(isDayFullyBlocked).not.toHaveBeenCalled();
    });

    it("succeeds for installment services even when date/startTime are absent", async () => {
        prismaMock.default.service.findUnique.mockResolvedValue(installmentService);

        const result = await BookingValidator.validateCreateBooking({ serviceId: "svc-1" });

        expect(result.bookingDay).toBeNull();
        expect(result.cleanStartTime).toBeNull();
        expect(result.service).toBe(installmentService);
    });

    it("throws SERVICE_NOT_FOUND when the service does not exist", async () => {
        prismaMock.default.service.findUnique.mockResolvedValue(null);

        await expect(
            BookingValidator.validateCreateBooking({ serviceId: "missing" }),
        ).rejects.toMatchObject({ message: "SERVICE_NOT_FOUND" });
    });

    it("still rejects an invalid date for non-installment services", async () => {
        prismaMock.default.service.findUnique.mockResolvedValue(normalService);

        await expect(
            BookingValidator.validateCreateBooking({
                serviceId: "svc-2",
                date: "not-a-date",
                startTime: "10:00",
            }),
        ).rejects.toMatchObject({ message: "INVALID_DATE" });
    });
});
