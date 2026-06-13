import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
    case: { findUnique: vi.fn(), update: vi.fn() },
    reminder: { updateMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
};

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));
// Collaborators pulled in transitively by the service — stub to no-ops.
vi.mock("../../core/services/google/drive.js", () => ({ driveService: {} }));
vi.mock("../../core/services/google/customer-folder.js", () => ({ ensureCustomerFolder: vi.fn() }));
vi.mock("../../core/services/waapi/waapi.service.js", () => ({ sendWhatsAppFile: vi.fn() }));
vi.mock("../../core/utils/email.js", () => ({ sendEmailWithTemplate: vi.fn() }));
vi.mock("./case-pdf.service.js", () => ({ renderCaseReportPdf: vi.fn() }));

const { CasesService } = await import("./cases.service.js");
const { ReminderService } = await import("../reminders/reminders.service.js");

const cases = new CasesService();
const reminders = new ReminderService();
const admin = { id: "u1", role: "ADMIN" as const };

beforeEach(() => {
    vi.clearAllMocks();
    // $transaction runs the callback against the same prisma mock.
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

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
