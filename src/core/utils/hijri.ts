import momentHijri from "moment-hijri";

/**
 * Convert a Hijri (Umm al-Qura) session date + time-of-day into the Gregorian
 * instant it represents. Reminders are scheduled and the cron fires off this
 * Gregorian `Date` — the Hijri string stays the canonical value shown in the UI.
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
    const m = momentHijri(`${hijriDate.trim()} ${time.trim()}`, "iYYYY-iMM-iDD HH:mm");
    if (!m.isValid()) {
        throw new Error(`Hijri date "${hijriDate} ${time}" is not a valid date`);
    }
    return m.toDate();
}
