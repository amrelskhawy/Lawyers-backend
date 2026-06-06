import { describe, it, expect } from "vitest";
import { hijriToGregorian } from "./hijri.js";

describe("hijriToGregorian", () => {
    it("converts a valid Hijri date + time to the right Gregorian instant", () => {
        // 1447-12-15 14:30 (Umm al-Qura) → 2026-06-01 14:30 local
        const d = hijriToGregorian("1447-12-15", "14:30");
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(5); // June (0-indexed)
        expect(d.getDate()).toBe(1);
        expect(d.getHours()).toBe(14);
        expect(d.getMinutes()).toBe(30);
    });

    it("rejects a malformed Hijri date", () => {
        expect(() => hijriToGregorian("2026/06/01", "14:30")).toThrow();
    });

    it("rejects a malformed time", () => {
        expect(() => hijriToGregorian("1447-12-15", "2pm")).toThrow();
    });
});
