import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
    reminder: { findMany: vi.fn(), update: vi.fn() },
};
const sendWhatsAppMessage = vi.fn();

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../core/services/waapi/waapi.service.js", () => ({ sendWhatsAppMessage }));

const { ReminderService } = await import("./reminders.service.js");
const service = new ReminderService();

const now = new Date("2026-07-01T09:00:00.000Z");
const sessionDate = new Date("2026-07-10T09:00:00.000Z");

function dueReminder(type: string, createdBy = { role: "LAWYER", phone: "966500000002" }) {
    return {
        id: "r1",
        type,
        content: "hello",
        repeat: false,
        repeatEveryHours: null,
        scheduledAt: now,
        createdBy,
        case: {
            sessionDate,
            sessionHijriDate: "1447-12-15",
            sessionTime: "09:00",
            agencyNumber: "A-1",
            customer: { fullName: "Sara", phone: "966500000001" },
            preferredLawyer: { phone: "966500000002" },
            sessionReceiver: { phone: null },
            sessionReports: [],
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.reminder.update.mockResolvedValue({});
    sendWhatsAppMessage.mockResolvedValue({});
});

describe("processDueReminders recipients", () => {
    it("CUSTOM reminders created by a lawyer go to that lawyer only", async () => {
        prismaMock.reminder.findMany.mockResolvedValue([dueReminder("CUSTOM")]);

        await service.processDueReminders(now);

        expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
        expect(sendWhatsAppMessage).toHaveBeenCalledWith("966500000002", expect.any(String));
        const calledNumbers = sendWhatsAppMessage.mock.calls.map((c) => c[0]);
        expect(calledNumbers).not.toContain("966500000001");
    });

    it("CUSTOM reminders created by a consultant go to that consultant only", async () => {
        prismaMock.reminder.findMany.mockResolvedValue([
            dueReminder("CUSTOM", { role: "CONSULTANT", phone: "966500000003" }),
        ]);

        await service.processDueReminders(now);

        expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
        expect(sendWhatsAppMessage).toHaveBeenCalledWith("966500000003", expect.any(String));
        const calledNumbers = sendWhatsAppMessage.mock.calls.map((c) => c[0]);
        expect(calledNumbers).not.toContain("966500000001");
        expect(calledNumbers).not.toContain("966500000002");
    });

    it("non-CUSTOM reminders go to both lawyer and customer", async () => {
        prismaMock.reminder.findMany.mockResolvedValue([dueReminder("URGENT_SESSION_SOON")]);

        await service.processDueReminders(now);

        const calledNumbers = sendWhatsAppMessage.mock.calls.map((c) => c[0]);
        expect(calledNumbers).toContain("966500000002"); // lawyer
        expect(calledNumbers).toContain("966500000001"); // customer
    });
});
