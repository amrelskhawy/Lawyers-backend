import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
    reminder: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    case: { findUnique: vi.fn() },
};

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));

const { computeNextReminderState, ReminderService } = await import("./reminders.service.js");

const sessionDate = new Date("2026-07-10T09:00:00.000Z");
const service = new ReminderService();

const openCase = {
    id: "c1",
    sessionDate,
    preferredLawyerId: "lawyer1",
    consultantId: "consultant1",
    sessionReceiverId: null,
    isDeleted: false,
    completedAt: null,
};

beforeEach(() => vi.clearAllMocks());

describe("computeNextReminderState", () => {
    it("one-shot (no repeat) → SENT", () => {
        const now = new Date("2026-07-01T09:00:00.000Z");
        const next = computeNextReminderState(
            { repeat: false, repeatEveryHours: null, scheduledAt: now },
            sessionDate,
            now,
        );
        expect(next.status).toBe("SENT");
        expect(next.lastSentAt).toEqual(now);
        expect(next.sentCountDelta).toBe(1);
    });

    it("repeat with next send before session → stays PENDING, advances scheduledAt", () => {
        const now = new Date("2026-07-01T09:00:00.000Z");
        const next = computeNextReminderState(
            { repeat: true, repeatEveryHours: 8, scheduledAt: now },
            sessionDate,
            now,
        );
        expect(next.status).toBe("PENDING");
        expect(next.scheduledAt).toEqual(new Date("2026-07-01T17:00:00.000Z"));
        expect(next.sentCountDelta).toBe(1);
    });

    it("repeat whose next send is on/after session → SENT (capped)", () => {
        const now = new Date("2026-07-10T02:00:00.000Z"); // +8h = 10:00 > 09:00 session
        const next = computeNextReminderState(
            { repeat: true, repeatEveryHours: 8, scheduledAt: now },
            sessionDate,
            now,
        );
        expect(next.status).toBe("SENT");
    });

    it("CUSTOM repeat advances from the reminder date, not the send time", () => {
        const scheduledAt = new Date("2026-07-01T09:00:00.000Z");
        const now = new Date("2026-07-01T09:05:00.000Z"); // cron ran 5 min late
        const next = computeNextReminderState(
            { repeat: true, repeatEveryHours: 24, scheduledAt },
            null,
            now,
            "CUSTOM",
        );
        expect(next.status).toBe("PENDING");
        expect(next.scheduledAt).toEqual(new Date("2026-07-02T09:00:00.000Z"));
    });

    it("CUSTOM repeat is not capped by the session date", () => {
        const scheduledAt = new Date("2026-07-09T09:00:00.000Z");
        const now = new Date("2026-07-09T09:00:00.000Z");
        const next = computeNextReminderState(
            { repeat: true, repeatEveryHours: 8, scheduledAt },
            sessionDate,
            now,
            "CUSTOM",
        );
        expect(next.status).toBe("PENDING");
        expect(next.scheduledAt).toEqual(new Date("2026-07-09T17:00:00.000Z"));
    });
});

describe("ReminderService create — CUSTOM without a session date", () => {
    const noSessionCase = { ...openCase, sessionDate: null };
    // A Hijri date that resolves well into the future, past "now".
    const futureReminder = {
        caseId: "c1",
        type: "CUSTOM" as const,
        content: "follow up with the client",
        hijriDate: "1448-12-15",
        time: "14:30",
    };

    it("creates a CUSTOM reminder even when the case has no session date", async () => {
        prismaMock.case.findUnique.mockResolvedValue(noSessionCase);
        prismaMock.reminder.create.mockResolvedValue({ id: "r1" });

        await service.create(futureReminder, { id: "lawyer1", role: "LAWYER" });

        expect(prismaMock.reminder.create).toHaveBeenCalled();
    });

    it("still requires a session date for non-CUSTOM reminders", async () => {
        prismaMock.case.findUnique.mockResolvedValue(noSessionCase);

        await expect(
            service.create(
                { ...futureReminder, type: "SESSION_DETAILS_REVIEW" },
                { id: "lawyer1", role: "LAWYER" },
            ),
        ).rejects.toMatchObject({ message: "REMINDER_SESSION_DATE_REQUIRED" });
        expect(prismaMock.reminder.create).not.toHaveBeenCalled();
    });
});

describe("ReminderService ownership", () => {
    it("allows a lawyer to update their own manual reminder", async () => {
        prismaMock.reminder.findUnique.mockResolvedValue({
            caseId: "c1",
            status: "PENDING",
            createdById: "lawyer1",
            autoScheduled: false,
        });
        prismaMock.case.findUnique.mockResolvedValue(openCase);
        prismaMock.reminder.update.mockResolvedValue({ id: "r1" });

        await service.update("r1", { content: "updated" }, { id: "lawyer1", role: "LAWYER" });

        expect(prismaMock.reminder.update).toHaveBeenCalled();
    });

    it("rejects a lawyer updating another user's reminder", async () => {
        prismaMock.reminder.findUnique.mockResolvedValue({
            caseId: "c1",
            status: "PENDING",
            createdById: "consultant1",
            autoScheduled: false,
        });

        await expect(
            service.update("r1", { content: "nope" }, { id: "lawyer1", role: "LAWYER" }),
        ).rejects.toMatchObject({ message: "AUTH_UNAUTHORIZED" });
    });

    it("rejects a consultant deleting auto-scheduled session reminders", async () => {
        prismaMock.reminder.findUnique.mockResolvedValue({
            caseId: "c1",
            createdById: "consultant1",
            autoScheduled: true,
        });

        await expect(service.remove("r1", { id: "consultant1", role: "CONSULTANT" })).rejects.toMatchObject({
            message: "AUTH_UNAUTHORIZED",
        });
    });

    it("allows staff to delete any reminder", async () => {
        prismaMock.reminder.findUnique.mockResolvedValue({
            caseId: "c1",
            createdById: "lawyer1",
            autoScheduled: true,
        });
        prismaMock.case.findUnique.mockResolvedValue(openCase);
        prismaMock.reminder.delete.mockResolvedValue({ id: "r1" });

        await service.remove("r1", { id: "admin1", role: "ADMIN" });

        expect(prismaMock.reminder.delete).toHaveBeenCalled();
    });
});
