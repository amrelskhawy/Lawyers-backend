import type { ReminderType } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import logger from "../../core/utils/logger.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The reminders auto-scheduled when a session date is set, each at a fixed
 * offset before the session. Messages are resolved at send time from
 * `reminders.messages.ts` by type — nothing is persisted per reminder here.
 */
const SESSION_DETAILS_REVIEW = { type: "SESSION_DETAILS_REVIEW" as ReminderType, beforeMs: 15 * DAY };
const MEMO_REVIEW_UPLOAD = { type: "MEMO_REVIEW_UPLOAD" as ReminderType, beforeMs: 7 * DAY };
const URGENT_SESSION_SOON = { type: "URGENT_SESSION_SOON" as ReminderType, beforeMs: 1 * HOUR };

/**
 * Pick which reminders to schedule based on how far the session is.
 * The full set only makes sense when there's enough lead time:
 *   - ≥ 15 days out → 3 reminders (15d, 7d, 1h)
 *   - ≥ 7 days out  → 2 reminders (7d, 1h)
 *   - otherwise     → 1 reminder  (1h)
 */
export function selectSessionReminderOffsets(
    sessionDate: Date,
    now: Date,
): { type: ReminderType; beforeMs: number }[] {
    const gap = sessionDate.getTime() - now.getTime();
    if (gap >= 15 * DAY) return [SESSION_DETAILS_REVIEW, MEMO_REVIEW_UPLOAD, URGENT_SESSION_SOON];
    if (gap >= 7 * DAY) return [MEMO_REVIEW_UPLOAD, URGENT_SESSION_SOON];
    return [URGENT_SESSION_SOON];
}

/**
 * (Re)schedule the 3 session reminders for a case against `sessionDate`.
 * Replaces still-PENDING auto reminders (already-sent ones are kept as history)
 * and creates a fresh reminder for each offset that still falls in the future.
 * Offsets that would land in the past are skipped and logged — never silently
 * dropped.
 */
export async function scheduleSessionReminders(
    caseId: string,
    sessionDate: Date,
    createdById: string,
): Promise<{ created: number; skipped: ReminderType[] }> {
    // Replace pending, keep sent.
    await prisma.reminder.deleteMany({
        where: { caseId, autoScheduled: true, status: "PENDING" },
    });

    const now = Date.now();
    const skipped: ReminderType[] = [];
    const offsets = selectSessionReminderOffsets(sessionDate, new Date(now));
    const toCreate = offsets.flatMap(({ type, beforeMs }) => {
        const scheduledAt = new Date(sessionDate.getTime() - beforeMs);
        // Safety net: even within the selected tier, never schedule in the past
        // (e.g. session is < 1h away).
        if (scheduledAt.getTime() <= now) {
            skipped.push(type);
            return [];
        }
        return [
            {
                caseId,
                type,
                scheduledAt,
                autoScheduled: true,
                createdById,
            },
        ];
    });

    if (toCreate.length) {
        await prisma.reminder.createMany({ data: toCreate });
    }
    if (skipped.length) {
        logger.info(
            `[reminders] case ${caseId}: skipped ${skipped.length} past-due session reminder(s): ${skipped.join(", ")}`,
        );
    }

    return { created: toCreate.length, skipped };
}
