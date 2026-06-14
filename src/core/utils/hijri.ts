import momentHijri from "moment-hijri";

/**
 * The entered session time is always meant as Saudi (Asia/Riyadh) wall-clock —
 * a fixed +03:00 offset, no DST. We pin to it explicitly so the conversion is
 * deterministic instead of depending on the host's local timezone (dev machines
 * run +03:00, the production server runs UTC — which made identical input land
 * hours apart).
 */
const RIYADH_UTC_OFFSET_MINUTES = 3 * 60;

/**
 * Convert a Hijri (Umm al-Qura) session date + time-of-day into the Gregorian
 * instant it represents. Reminders are scheduled and the cron fires off this
 * Gregorian `Date` — the Hijri string stays the canonical value shown in the UI.
 *
 * The time-of-day is interpreted as Asia/Riyadh wall-clock regardless of where
 * this runs, so the same input yields the same instant on every host.
 *
 * @param hijriDate Hijri date as `iYYYY-iMM-iDD`, e.g. "1447-12-15".
 * @param time      24h time-of-day as `HH:mm`, e.g. "14:30".
 * @returns the corresponding Gregorian `Date`.
 * @throws if either part is malformed or out of the supported Hijri range.
 */
export function hijriToGregorian(hijriDate: string, time: string): Date {
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(hijriDate.trim())) {
        throw new Error(`Invalid Hijri date "${hijriDate}" (expected iYYYY-iMM-iDD)`);
    }
    if (!/^\d{1,2}:\d{2}$/.test(time.trim())) {
        throw new Error(`Invalid time "${time}" (expected HH:mm)`);
    }
    // Parse the wall-clock components as UTC (host-independent), then shift back
    // by the Riyadh offset so the entered time is treated as +03:00 everywhere.
    // `.utc` exists at runtime (moment-hijri extends moment) but isn't in its types.
    const utcParse = (momentHijri as unknown as { utc: typeof momentHijri }).utc;
    const m = utcParse(`${hijriDate.trim()} ${time.trim()}`, "iYYYY-iMM-iDD HH:mm");
    if (!m.isValid()) {
        throw new Error(`Hijri date "${hijriDate} ${time}" is not a valid date`);
    }
    // The parsed instant is the wall-clock read as UTC; shift it back to +03:00.
    return new Date(m.toDate().getTime() - RIYADH_UTC_OFFSET_MINUTES * 60 * 1000);
}

/**
 * Gregorian half-open range `[start, end)` covering one Hijri month — used to
 * page the cases calendar by month by filtering the stored Gregorian
 * `sessionDate` (which is reliable, unlike the loosely-formatted Hijri string).
 *
 * Boundaries are the start-of-day (Riyadh) of the 1st of the given month and the
 * 1st of the following month, so a session anywhere in the month falls in range.
 *
 * @param iYear  Hijri year, e.g. 1447.
 * @param iMonth Hijri month, 1-12.
 */
export function hijriMonthRange(iYear: number, iMonth: number): { start: Date; end: Date } {
    if (!Number.isInteger(iYear) || !Number.isInteger(iMonth) || iMonth < 1 || iMonth > 12) {
        throw new Error(`Invalid Hijri month ${iYear}-${iMonth}`);
    }
    // 1st of next month, rolling over the year boundary.
    const nextYear = iMonth === 12 ? iYear + 1 : iYear;
    const nextMonth = iMonth === 12 ? 1 : iMonth + 1;
    const start = hijriToGregorian(`${iYear}-${iMonth}-1`, "00:00");
    const end = hijriToGregorian(`${nextYear}-${nextMonth}-1`, "00:00");
    return { start, end };
}

/** "1447-12-15" → "15 / 12 / 1447" (report / PDF picker format). */
export function formatCanonicalHijriDate(value: string | null | undefined): string {
    if (!value) return "";
    const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return value;
    const [, year, month, day] = m;
    return `${day.padStart(2, "0")} / ${month.padStart(2, "0")} / ${year}`;
}

const HIJRI_DISPLAY_FMT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
});

/** Gregorian instant → "DD / MM / YYYY" Hijri string for display. */
export function gregorianToDisplayHijri(value: Date | null | undefined): string {
    if (!value) return "";
    const parts = HIJRI_DISPLAY_FMT.formatToParts(value);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day").padStart(2, "0")} / ${get("month").padStart(2, "0")} / ${get("year")}`;
}

/**
 * Canonical Hijri session date for reports — prefers `sessionHijriDate`, falls
 * back to deriving Hijri from the stored Gregorian `sessionDate`.
 */
export function formatSessionHijriDateForDisplay(
    sessionHijriDate: string | null | undefined,
    sessionDate: Date | null | undefined,
): string {
    if (sessionHijriDate) return formatCanonicalHijriDate(sessionHijriDate);
    return gregorianToDisplayHijri(sessionDate);
}
