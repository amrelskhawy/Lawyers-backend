import type { ReminderType } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import logger from "../../core/utils/logger.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The 3 reminders auto-scheduled when a session date is set, each at a fixed
 * offset before the session. Messages are resolved at send time from
 * `reminders.messages.ts` by type — nothing is persisted per reminder here.
 */
const SESSION_REMINDER_OFFSETS: { type: ReminderType; beforeMs: number }[] = [
    { type: "SESSION_DETAILS_REVIEW", beforeMs: 15 * DAY },
    { type: "MEMO_REVIEW_UPLOAD", beforeMs: 7 * DAY },
    { type: "URGENT_SESSION_SOON", beforeMs: 1 * HOUR },
];

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
    const toCreate = SESSION_REMINDER_OFFSETS.flatMap(({ type, beforeMs }) => {
        const scheduledAt = new Date(sessionDate.getTime() - beforeMs);
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
