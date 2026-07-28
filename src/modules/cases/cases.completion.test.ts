import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
    case: { findUnique: vi.fn(), update: vi.fn() },
    reminder: { updateMany: vi.fn(), findUnique: vi.fn() },
    lawyerFeesContract: { findMany: vi.fn() },
    $transaction: vi.fn(),
};

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));
// Collaborators pulled in transitively by the service — stub to no-ops.
vi.mock("../../core/services/google/drive.js", () => ({ driveService: {} }));
vi.mock("../../core/services/google/customer-folder.js", () => ({ ensureCustomerFolder: vi.fn() }));
vi.mock("../../core/services/waapi/waapi.service.js", () => ({
    sendWhatsAppFile: vi.fn(),
    sendWhatsAppMessage: vi.fn(),
}));
vi.mock("../../core/utils/email.js", () => ({ sendEmailWithTemplate: vi.fn() }));
vi.mock("./case-pdf.service.js", () => ({ renderCaseReportPdf: vi.fn() }));

const { CasesService } = await import("./cases.service.js");
const { ReminderService } = await import("../reminders/reminders.service.js");
const { sendWhatsAppMessage } = await import("../../core/services/waapi/waapi.service.js");
const sendMessageMock = vi.mocked(sendWhatsAppMessage);

const cases = new CasesService();
const reminders = new ReminderService();
const admin = { id: "u1", role: "ADMIN" as const };

beforeEach(() => {
    vi.clearAllMocks();
    // $transaction runs the callback against the same prisma mock.
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.lawyerFeesContract.findMany.mockResolvedValue([]);
});

/** A case row that passes the permission checks in setCompletion. */
function openCase() {
    return { id: "c1", isDeleted: false, preferredLawyerId: null, sessionReceiverId: null };
}

describe("CasesService.setCompletion", () => {
    it("completing cancels every PENDING reminder and sets completedAt", async () => {
        prismaMock.case.findUnique.mockResolvedValue({
            id: "c1",
            isDeleted: false,
            preferredLawyerId: null,
            sessionReceiverId: null,
        });
        prismaMock.case.update.mockResolvedValue({ id: "c1", completedAt: new Date() });

        await cases.setCompletion("c1", true, "u1", "ADMIN");

        expect(prismaMock.reminder.updateMany).toHaveBeenCalledWith({
            where: { caseId: "c1", status: "PENDING" },
            data: { status: "CANCELLED" },
        });
        const updateArg = prismaMock.case.update.mock.calls[0][0];
        expect(updateArg.data.completedAt).toBeInstanceOf(Date);
    });

    it("reopening clears completedAt and does NOT cancel reminders", async () => {
        prismaMock.case.findUnique.mockResolvedValue({
            id: "c1",
            isDeleted: false,
            preferredLawyerId: null,
            sessionReceiverId: null,
        });
        prismaMock.case.update.mockResolvedValue({ id: "c1", completedAt: null });

        await cases.setCompletion("c1", false, "u1", "ADMIN");

        expect(prismaMock.reminder.updateMany).not.toHaveBeenCalled();
        const updateArg = prismaMock.case.update.mock.calls[0][0];
        expect(updateArg.data.completedAt).toBeNull();
    });
});

describe("CasesService.setCompletion outstanding-balance WhatsApp", () => {
    beforeEach(() => {
        prismaMock.case.findUnique.mockResolvedValue(openCase());
        prismaMock.case.update.mockResolvedValue({
            id: "c1",
            completedAt: new Date(),
            customerId: "cust1",
            customer: { phone: "966500000000", fullName: "عميل السجل" },
        });
    });

    it("counts only contracts linked to this case, never the client's other ones", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            { clientName: null, clientPhone: "966500345823", totalFees: "16000", payments: [] },
        ]);

        const res: any = await cases.setCompletion("c1", true, "u1", "ADMIN");

        const where = prismaMock.lawyerFeesContract.findMany.mock.calls[0][0].where;
        expect(where).toEqual({ caseId: "c1", isDeleted: false });
        expect(res.balanceNotification).toMatchObject({ sent: true, remaining: 16000 });
    });

    it("messages the contract's client phone with the unpaid remainder", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            {
                clientName: "عمرو السخاوي",
                clientPhone: "966511111111",
                totalFees: "10000",
                payments: [{ amount: "2500" }],
            },
        ]);

        const res: any = await cases.setCompletion("c1", true, "u1", "ADMIN");

        expect(sendMessageMock).toHaveBeenCalledTimes(1);
        const [phone, message] = sendMessageMock.mock.calls[0]!;
        expect(phone).toBe("966511111111");
        expect(message).toContain("عزيزي العميل / عمرو السخاوي");
        expect(message).toContain("ومقدارها 7,500 ريال سعودي");
        expect(res.balanceNotification).toMatchObject({ sent: true, remaining: 7500 });
    });

    it("falls back to the customer record's name when no contract names the client", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            { clientName: null, clientPhone: "966511111111", totalFees: "1000", payments: [] },
        ]);

        await cases.setCompletion("c1", true, "u1", "ADMIN");

        expect(sendMessageMock.mock.calls[0]![1]).toContain("عزيزي العميل / عميل السجل");
    });

    it("greets generically when neither the contract nor the customer has a name", async () => {
        prismaMock.case.update.mockResolvedValue({
            id: "c1",
            completedAt: new Date(),
            customerId: "cust1",
            customer: { phone: "966500000000", fullName: null },
        });
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            { clientName: null, clientPhone: "966511111111", totalFees: "1000", payments: [] },
        ]);

        await cases.setCompletion("c1", true, "u1", "ADMIN");

        const message = sendMessageMock.mock.calls[0]![1];
        expect(message).toContain("عزيزي العميل:");
        expect(message).not.toContain("/");
    });

    it("sums across the case's contracts and ignores fully-paid ones", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            { clientName: null, clientPhone: null, totalFees: "4000", payments: [{ amount: "4000" }] },
            { clientName: null, clientPhone: null, totalFees: "3000", payments: [{ amount: "500" }] },
        ]);

        const res: any = await cases.setCompletion("c1", true, "u1", "ADMIN");

        // No clientPhone on either contract — falls back to the customer record.
        expect(sendMessageMock.mock.calls[0]![0]).toBe("966500000000");
        expect(res.balanceNotification.remaining).toBe(2500);
    });

    it("sends nothing when the case is fully paid", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            {
                clientName: null,
                clientPhone: "966511111111",
                totalFees: "1000",
                payments: [{ amount: "1000" }],
            },
        ]);

        const res: any = await cases.setCompletion("c1", true, "u1", "ADMIN");

        expect(sendMessageMock).not.toHaveBeenCalled();
        expect(res.balanceNotification).toMatchObject({ sent: false, skippedReason: "NO_BALANCE" });
    });

    it("still closes the case when WhatsApp delivery fails", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            { clientName: null, clientPhone: "966511111111", totalFees: "1000", payments: [] },
        ]);
        sendMessageMock.mockRejectedValueOnce(new Error("WAAPI down"));

        const res: any = await cases.setCompletion("c1", true, "u1", "ADMIN");

        expect(res.completedAt).toBeInstanceOf(Date);
        expect(res.balanceNotification).toMatchObject({ sent: false, error: "WAAPI down" });
    });

    it("does not message the client when the case is reopened", async () => {
        prismaMock.lawyerFeesContract.findMany.mockResolvedValue([
            { clientName: null, clientPhone: "966511111111", totalFees: "1000", payments: [] },
        ]);

        await cases.setCompletion("c1", false, "u1", "ADMIN");

        expect(sendMessageMock).not.toHaveBeenCalled();
    });
});

describe("ReminderService blocks actions on a completed case", () => {
    it("create throws CASE_COMPLETED when the case is completed", async () => {
        prismaMock.case.findUnique.mockResolvedValue({
            id: "c1",
            sessionDate: new Date("2026-07-10T09:00:00.000Z"),
            preferredLawyerId: null,
            sessionReceiverId: null,
            isDeleted: false,
            completedAt: new Date(),
        });

        await expect(
            reminders.create(
                { caseId: "c1", type: "CUSTOM", hijriDate: "1447-12-15", time: "14:30", repeat: false },
                admin,
            ),
        ).rejects.toMatchObject({ message: "CASE_COMPLETED" });
    });
});

describe("ReminderService.update only edits PENDING reminders", () => {
    it("throws REMINDER_NOT_EDITABLE when the reminder is already SENT", async () => {
        prismaMock.reminder.findUnique.mockResolvedValue({ caseId: "c1", status: "SENT" });

        await expect(
            reminders.update("r1", { title: "new" }, admin),
        ).rejects.toMatchObject({ message: "REMINDER_NOT_EDITABLE" });
        expect(prismaMock.case.findUnique).not.toHaveBeenCalled();
    });
});
