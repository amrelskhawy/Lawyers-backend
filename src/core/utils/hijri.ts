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
