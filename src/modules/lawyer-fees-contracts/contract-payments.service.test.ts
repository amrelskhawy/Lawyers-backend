import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
    lawyerFeesContract: { findUnique: vi.fn(), findMany: vi.fn() },
    contractPayment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));

const { ContractPaymentsService } = await import("./contract-payments.service.js");
const { AppResponse } = await import("../../core/utils/AppResponse.js");

const service = new ContractPaymentsService();

/** Prisma hands money back as Decimal-like strings — mirror that in the mocks. */
const contract = (totalFees: string | null) => ({
    id: "k1",
    totalFees,
    isDeleted: false,
    currency: "SAR",
});

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.contractPayment.create.mockResolvedValue({});
    prismaMock.contractPayment.update.mockResolvedValue({});
});

describe("ContractPaymentsService.listForContract", () => {
    it("derives paid and remaining from the payment rows", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract("400000.00"));
        prismaMock.contractPayment.findMany.mockResolvedValue([
            { id: "p1", amount: "240000.00", paidAt: new Date(), recordedBy: null },
            { id: "p2", amount: "60000.50", paidAt: new Date(), recordedBy: null },
        ]);

        const result = await service.listForContract("k1");

        expect(result.totalFees).toBe(400000);
        expect(result.paidTotal).toBe(300000.5);
        expect(result.remaining).toBe(99999.5);
        // Money reaches the client as numbers, never Prisma Decimals.
        expect(result.payments.map((p) => p.amount)).toEqual([240000, 60000.5]);
    });

    it("reports a contract with no fees set as owing nothing", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract(null));
        prismaMock.contractPayment.findMany.mockResolvedValue([]);

        const result = await service.listForContract("k1");

        expect(result.totalFees).toBe(0);
        expect(result.remaining).toBe(0);
    });

    it("404s on a deleted contract", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue({
            ...contract("100"),
            isDeleted: true,
        });

        await expect(service.listForContract("k1")).rejects.toBeInstanceOf(AppResponse);
    });
});

describe("ContractPaymentsService.create", () => {
    const payload = { amount: 50, paidAt: new Date("2026-05-01").toISOString(), note: null };

    it("records a payment that fits inside the contract total", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract("100.00"));
        // First call: the overpay guard. Second: the refreshed list.
        prismaMock.contractPayment.findMany
            .mockResolvedValueOnce([{ amount: "40.00" }])
            .mockResolvedValueOnce([
                { id: "p1", amount: "40.00", paidAt: new Date(), recordedBy: null },
                { id: "p2", amount: "50.00", paidAt: new Date(), recordedBy: null },
            ]);

        const result = await service.create("k1", payload, "u1");

        expect(prismaMock.contractPayment.create).toHaveBeenCalledOnce();
        expect(result.paidTotal).toBe(90);
        expect(result.remaining).toBe(10);
    });

    it("rejects a payment that would exceed the contract total", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract("100.00"));
        prismaMock.contractPayment.findMany.mockResolvedValueOnce([{ amount: "80.00" }]);

        await expect(service.create("k1", payload, "u1")).rejects.toMatchObject({
            message: "PAYMENT_EXCEEDS_CONTRACT_TOTAL",
        });
        expect(prismaMock.contractPayment.create).not.toHaveBeenCalled();
    });

    it("allows a payment that settles the contract exactly", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract("100.00"));
        prismaMock.contractPayment.findMany
            .mockResolvedValueOnce([{ amount: "50.00" }])
            .mockResolvedValueOnce([
                { id: "p1", amount: "50.00", paidAt: new Date(), recordedBy: null },
                { id: "p2", amount: "50.00", paidAt: new Date(), recordedBy: null },
            ]);

        const result = await service.create("k1", payload, "u1");

        expect(result.remaining).toBe(0);
    });

    it("refuses payments until the contract total is set", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract(null));

        await expect(service.create("k1", payload, "u1")).rejects.toMatchObject({
            message: "CONTRACT_TOTAL_FEES_NOT_SET",
        });
        expect(prismaMock.contractPayment.create).not.toHaveBeenCalled();
    });
});

describe("ContractPaymentsService.update", () => {
    it("ignores the payment's own current amount when re-checking the total", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract("100.00"));
        prismaMock.contractPayment.findUnique.mockResolvedValue({
            id: "p1",
            contractId: "k1",
            isDeleted: false,
            amount: "90.00",
        });
        // Guard sees only the *other* payments — raising p1 to 95 must be allowed.
        prismaMock.contractPayment.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { id: "p1", amount: "95.00", paidAt: new Date(), recordedBy: null },
            ]);

        const result = await service.update("k1", "p1", { amount: 95 });

        expect(prismaMock.contractPayment.update).toHaveBeenCalledOnce();
        expect(result.paidTotal).toBe(95);
    });

    it("404s when the payment belongs to a different contract", async () => {
        prismaMock.lawyerFeesContract.findUnique.mockResolvedValue(contract("100.00"));
        prismaMock.contractPayment.findUnique.mockResolvedValue({
            id: "p1",
            contractId: "other",
            isDeleted: false,
            amount: "10.00",
        });

        await expect(service.update("k1", "p1", { amount: 20 })).rejects.toMatchObject({
            message: "CONTRACT_PAYMENT_NOT_FOUND",
        });
    });
});

describe("ContractPaymentsService.listForCase", () => {
    it("rolls each contract on the case up to its own remaining balance", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            {
                id: "k1",
                contractNumber: "A-1",
                clientName: "Client",
                totalFees: "1000.00",
                currency: "SAR",
                contractDate: new Date("2026-01-01"),
                payments: [{ amount: "250.00" }, { amount: "250.00" }],
            },
            {
                id: "k2",
                contractNumber: null,
                clientName: null,
                totalFees: null,
                currency: null,
                contractDate: null,
                payments: [],
            },
        ]);

        const rows = await service.listForCase("case-1");

        expect(rows[0]).toMatchObject({ id: "k1", totalFees: 1000, paidTotal: 500, remaining: 500 });
        expect(rows[1]).toMatchObject({ id: "k2", totalFees: 0, paidTotal: 0, remaining: 0 });
    });
});
