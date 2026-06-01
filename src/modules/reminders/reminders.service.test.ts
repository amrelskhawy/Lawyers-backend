import { describe, it, expect } from "vitest";
import { computeNextReminderState } from "./reminders.service.js";

const sessionDate = new Date("2026-07-10T09:00:00.000Z");

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
});
