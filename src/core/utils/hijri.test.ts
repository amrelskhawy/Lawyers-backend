import { describe, it, expect } from "vitest";
import { hijriToGregorian } from "./hijri.js";

describe("hijriToGregorian", () => {
    it("converts a valid Hijri date + time to the right Gregorian instant", () => {
        // 1447-12-15 14:30 (Umm al-Qura) → 2026-06-01 14:30 Asia/Riyadh (+03:00).
        // Asserted as an absolute UTC instant so the result is host/TZ-independent.
        const d = hijriToGregorian("1447-12-15", "14:30");
        expect(d.toISOString()).toBe("2026-06-01T11:30:00.000Z");
    });

    it("rejects a malformed Hijri date", () => {
        expect(() => hijriToGregorian("2026/06/01", "14:30")).toThrow();
    });

    it("rejects a malformed time", () => {
        expect(() => hijriToGregorian("1447-12-15", "2pm")).toThrow();
    });
});
