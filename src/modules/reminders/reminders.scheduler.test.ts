import { describe, it, expect } from "vitest";
import { selectSessionReminderOffsets } from "./reminders.scheduler.js";

const now = new Date("2026-06-07T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const types = (d: Date) => selectSessionReminderOffsets(d, now).map((o) => o.type);

describe("selectSessionReminderOffsets", () => {
    it("≥ 15 days out → 3 reminders (15d, 7d, 1h)", () => {
        expect(types(new Date(now.getTime() + 20 * DAY))).toEqual([
            "SESSION_DETAILS_REVIEW",
            "MEMO_REVIEW_UPLOAD",
            "URGENT_SESSION_SOON",
        ]);
    });

    it("exactly 15 days out → still 3 reminders", () => {
        expect(types(new Date(now.getTime() + 15 * DAY))).toEqual([
            "SESSION_DETAILS_REVIEW",
            "MEMO_REVIEW_UPLOAD",
            "URGENT_SESSION_SOON",
        ]);
    });

    it("< 15 days, ≥ 7 days out → 2 reminders (7d, 1h)", () => {
        expect(types(new Date(now.getTime() + 10 * DAY))).toEqual([
            "MEMO_REVIEW_UPLOAD",
            "URGENT_SESSION_SOON",
        ]);
    });

    it("exactly 7 days out → still 2 reminders", () => {
        expect(types(new Date(now.getTime() + 7 * DAY))).toEqual([
            "MEMO_REVIEW_UPLOAD",
            "URGENT_SESSION_SOON",
        ]);
    });

    it("< 7 days out → 1 reminder (1h)", () => {
        expect(types(new Date(now.getTime() + 3 * DAY))).toEqual(["URGENT_SESSION_SOON"]);
    });
});
