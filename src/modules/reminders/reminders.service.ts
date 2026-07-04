import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { hijriToGregorian, gregorianToDisplayHijri } from "../../core/utils/hijri.js";
import { sendWhatsAppMessage } from "../../core/services/waapi/waapi.service.js";
import { buildMessages } from "./reminders.messages.js";
import type { CreateReminderPayload, MemoReminderPayload, UpdateReminderPayload } from "./reminders.types.js";
import type { ReminderType, Role } from "@prisma/client";

type NextStateInput = {
    repeat: boolean;
    repeatEveryHours: number | null;
    scheduledAt: Date;
};

/**
 * Pure decision for what a reminder's state becomes after a send at `now`.
 * Session reminders cap repeats before the next session; CUSTOM repeats anchor
 * on the reminder's own scheduled date instead of the send time.
 */
export function computeNextReminderState(
    r: NextStateInput,
    sessionDate: Date | null,
    now: Date,
    type: ReminderType = "SESSION_DETAILS_REVIEW",
): { status: "PENDING" | "SENT"; scheduledAt: Date; lastSentAt: Date; sentCountDelta: number } {
    if (!r.repeat || !r.repeatEveryHours) {
        return { status: "SENT", scheduledAt: r.scheduledAt, lastSentAt: now, sentCountDelta: 1 };
    }
    const anchorMs = type === "CUSTOM" ? r.scheduledAt.getTime() : now.getTime();
    let nextAt = new Date(anchorMs + r.repeatEveryHours * 60 * 60 * 1000);
    // CUSTOM repeats follow the reminder cadence — catch up if processing ran late.
    if (type === "CUSTOM") {
        while (nextAt.getTime() <= now.getTime()) {
            nextAt = new Date(nextAt.getTime() + r.repeatEveryHours * 60 * 60 * 1000);
        }
    } else if (sessionDate && nextAt.getTime() >= sessionDate.getTime()) {
        return { status: "SENT", scheduledAt: r.scheduledAt, lastSentAt: now, sentCountDelta: 1 };
    }
    return { status: "PENDING", scheduledAt: nextAt, lastSentAt: now, sentCountDelta: 1 };
}

const STAFF: Role[] = ["ADMIN", "MODERATOR"];

/**
 * CUSTOM reminder recipients by creator role:
 *   LAWYER     → lawyer only
 *   CONSULTANT → consultant only
 *   ADMIN      → admin + case lawyer + case consultant
 *   MODERATOR  → assigned lawyer (fallback)
 */
function resolveCustomRecipients(
    createdBy: { role: Role; phone: string | null },
    caseRow: {
        preferredLawyer?: { phone: string | null } | null;
        sessionReceiver?: { phone: string | null } | null;
        consultant?: { phone: string | null } | null;
    },
): string[] {
    if (createdBy.role === "LAWYER" || createdBy.role === "CONSULTANT") {
        return createdBy.phone ? [createdBy.phone] : [];
    }
    if (createdBy.role === "ADMIN") {
        const phones: string[] = [];
        const lawyerPhone = caseRow.preferredLawyer?.phone ?? caseRow.sessionReceiver?.phone;
        if (lawyerPhone) phones.push(lawyerPhone);
        if (caseRow.consultant?.phone) phones.push(caseRow.consultant.phone);
        return phones;
    }
    // MODERATOR: fall back to the assigned lawyer.
    const fallback = caseRow.preferredLawyer?.phone ?? caseRow.sessionReceiver?.phone;
    return fallback ? [fallback] : [];
}

/** Lawyers/consultants may only change reminders they created manually — not auto session ones or others'. */
function assertCanManageReminder(
    reminder: { createdById: string; autoScheduled: boolean },
    user: { id: string; role: Role },
) {
    if (STAFF.includes(user.role)) return;
    if (user.role === "LAWYER" || user.role === "CONSULTANT") {
        if (reminder.autoScheduled || reminder.createdById !== user.id) {
            throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
        }
    }
}

/** Throw 404/403 unless the case exists and the actor may manage its reminders. */
async function assertCaseAccess(caseId: string, user: { id: string; role: Role }) {
    const c = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            id: true,
            sessionDate: true,
            preferredLawyerId: true,
            consultantId: true,
            sessionReceiverId: true,
            isDeleted: true,
            completedAt: true,
        },
    });
    if (!c || c.isDeleted) throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
    const isCaseHandler = user.role === "LAWYER" || user.role === "CONSULTANT";
    if (
        isCaseHandler &&
        c.preferredLawyerId !== user.id &&
        c.consultantId !== user.id &&
        c.sessionReceiverId !== user.id
    ) {
        throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
    }
    if (!STAFF.includes(user.role) && !isCaseHandler) {
        throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
    }
    return c;
}

export class ReminderService {
    async listByCase(caseId: string, user: { id: string; role: Role }) {
        await assertCaseAccess(caseId, user);
        return prisma.reminder.findMany({
            where: { caseId },
            orderBy: { scheduledAt: "asc" },
        });
    }

    async create(payload: CreateReminderPayload, user: { id: string; role: Role }) {
        const c = await assertCaseAccess(payload.caseId, user);
        if (c.completedAt) {
            throw new AppResponse(false, "CASE_COMPLETED", null, 400);
        }
        // CUSTOM reminders stand alone and need no session to anchor to; every
        // other type is scheduled relative to the case session.
        if (payload.type !== "CUSTOM" && !c.sessionDate) {
            throw new AppResponse(false, "REMINDER_SESSION_DATE_REQUIRED", null, 400);
        }
        // Resolve the entered Hijri date + time into the Gregorian instant the
        // cron fires off — the same conversion used for the case session date.
        const scheduledAt = hijriToGregorian(payload.hijriDate, payload.time);
        if (scheduledAt.getTime() <= Date.now()) {
            throw new AppResponse(false, "REMINDER_SCHEDULE_IN_PAST", null, 400);
        }
        // Only session-anchored reminders are capped to before the session.
        if (
            payload.type !== "CUSTOM" &&
            c.sessionDate &&
            scheduledAt.getTime() >= c.sessionDate.getTime()
        ) {
            throw new AppResponse(false, "REMINDER_AFTER_SESSION", null, 400);
        }
        return prisma.reminder.create({
            data: {
                caseId: payload.caseId,
                type: payload.type,
                title: payload.title ?? null,
                content: payload.content ?? null,
                scheduledAt,
                repeat: payload.repeat ?? false,
                repeatEveryHours: payload.repeatEveryHours ?? null,
                createdById: user.id,
            },
        });
    }

    async update(id: string, payload: UpdateReminderPayload, user: { id: string; role: Role }) {
        const existing = await prisma.reminder.findUnique({
            where: { id },
            select: { caseId: true, status: true, createdById: true, autoScheduled: true },
        });
        if (!existing) throw new AppResponse(false, "REMINDER_NOT_FOUND", null, 404);
        // Only pending reminders can be edited — sent/failed/cancelled ones are history.
        if (existing.status !== "PENDING") {
            throw new AppResponse(false, "REMINDER_NOT_EDITABLE", null, 400);
        }
        assertCanManageReminder(existing, user);
        const c = await assertCaseAccess(existing.caseId, user);
        if (c.completedAt) {
            throw new AppResponse(false, "CASE_COMPLETED", null, 400);
        }

        // `hijriDate`/`time` are not columns — convert them to `scheduledAt` and
        // keep the rest of the payload as-is.
        const { hijriDate, time, ...rest } = payload;
        const data: Record<string, unknown> = { ...rest };
        if (hijriDate && time) {
            const scheduledAt = hijriToGregorian(hijriDate, time);
            if (c.sessionDate && scheduledAt.getTime() >= c.sessionDate.getTime()) {
                throw new AppResponse(false, "REMINDER_AFTER_SESSION", null, 400);
            }
            data.scheduledAt = scheduledAt;
        }
        return prisma.reminder.update({ where: { id }, data });
    }

    async remove(id: string, user: { id: string; role: Role }) {
        const existing = await prisma.reminder.findUnique({
            where: { id },
            select: { caseId: true, createdById: true, autoScheduled: true },
        });
        if (!existing) throw new AppResponse(false, "REMINDER_NOT_FOUND", null, 404);
        assertCanManageReminder(existing, user);
        await assertCaseAccess(existing.caseId, user);
        await prisma.reminder.delete({ where: { id } });
        return { id };
    }

    /**
     * Validate consultant assignment, send a WhatsApp memo-request message to the
     * consultant immediately, and persist the record (SENT or FAILED). Also stamps
     * `needsMemo` and `memoDeadline` on the case so the dialog reflects current state.
     */
    async sendMemoReminderToConsultant(payload: MemoReminderPayload, user: { id: string; role: Role }) {
        const c = await prisma.case.findUnique({
            where: { id: payload.caseId },
            include: {
                consultant: { select: { id: true, name: true, nameAr: true, phone: true } },
                customer: { select: { fullName: true } },
                sessionReports: {
                    where: { isDeleted: false },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { caseNumber: true, courtName: true },
                },
            },
        });

        if (!c || c.isDeleted) throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);

        if (!c.consultantId || !c.consultant) {
            throw new AppResponse(false, "MEMO_NO_CONSULTANT_ASSIGNED", null, 400);
        }
        if (c.consultantAssignmentStatus !== "ACCEPTED") {
            throw new AppResponse(false, "MEMO_CONSULTANT_NOT_ACCEPTED", null, 400);
        }

        const memoDeadline = new Date(payload.memoDeadline + "T00:00:00.000Z");

        // Format the deadline as a Hijri "DD / MM / YYYY" date for the Arabic
        // message body (the stored `memoDeadline` stays the Gregorian instant).
        const memoDeadlineFormatted = gregorianToDisplayHijri(memoDeadline);

        const latestReport = c.sessionReports[0];
        const message = buildMessages("MEMO_REQUEST", {
            consultantName: c.consultant.nameAr ?? c.consultant.name,
            caseNumber: latestReport?.caseNumber ?? c.agencyNumber,
            clientName: c.customer?.fullName,
            court: latestReport?.courtName,
            memoType: payload.memoType,
            memoDeadline: memoDeadlineFormatted,
        }).lawyer;

        let status: "SENT" | "FAILED" = "SENT";
        let failureReason: string | null = null;
        let lastSentAt: Date | null = null;

        if (!c.consultant.phone) {
            status = "FAILED";
            failureReason = "no phone on file for consultant";
        } else {
            try {
                await sendWhatsAppMessage(c.consultant.phone, message);
                lastSentAt = new Date();
            } catch (e: any) {
                status = "FAILED";
                failureReason = e?.message ?? "WhatsApp send failed";
            }
        }

        const [reminder] = await prisma.$transaction([
            prisma.reminder.create({
                data: {
                    caseId: payload.caseId,
                    type: "MEMO_REQUEST",
                    scheduledAt: new Date(),
                    status,
                    lastSentAt,
                    sentCount: status === "SENT" ? 1 : 0,
                    failureReason,
                    recipientId: c.consultantId,
                    memoDeadline,
                    createdById: user.id,
                },
            }),
            prisma.case.update({
                where: { id: payload.caseId },
                data: { needsMemo: true, memoDeadline, memoType: payload.memoType ?? null },
            }),
        ]);

        return { reminder, sentSuccessfully: status === "SENT" };
    }

    /**
     * List MEMO_REQUEST reminders. Consultants see only their own; lawyers see
     * only cases they are assigned to; admin/moderator see all.
     */
    async listConsultantReminders(user: { id: string; role: Role }) {
        const where: Record<string, unknown> = { type: "MEMO_REQUEST" };

        if (user.role === "CONSULTANT") {
            where.recipientId = user.id;
        }
        // ADMIN / MODERATOR: no additional filter — see all.

        return prisma.reminder.findMany({
            where,
            orderBy: { memoDeadline: "asc" },
            include: {
                case: {
                    select: {
                        id: true,
                        agencyNumber: true,
                        needsMemo: true,
                        memoDeadline: true,
                        memoType: true,
                        consultantId: true,
                        customer: { select: { fullName: true } },
                        consultant: { select: { name: true, nameAr: true } },
                        sessionReports: {
                            where: { isDeleted: false },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: { caseNumber: true, courtName: true },
                        },
                    },
                },
                createdBy: { select: { name: true, nameAr: true } },
            },
        });
    }

    /**
     * Find every due reminder and send it. Best-effort: a send failure is
     * recorded on the row and never throws out of the loop.
     */
    async processDueReminders(now: Date = new Date()) {
        const due = await prisma.reminder.findMany({
            where: { status: "PENDING", scheduledAt: { lte: now }, type: { not: "MEMO_REQUEST" } },
            include: {
                createdBy: { select: { role: true, phone: true } },
                case: {
                    select: {
                        sessionDate: true,
                        sessionHijriDate: true,
                        sessionTime: true,
                        agencyNumber: true,
                        customer: { select: { fullName: true, phone: true } },
                        preferredLawyer: { select: { phone: true } },
                        sessionReceiver: { select: { phone: true } },
                        consultant: { select: { phone: true } },
                        // Case number + court live on the latest session report.
                        sessionReports: {
                            where: { isDeleted: false },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                            select: { caseNumber: true, courtName: true },
                        },
                    },
                },
            },
        });

        for (const r of due) {
            const sessionDate = r.case.sessionDate;
            // No session cap reference, or session already passed → finalize as SENT (don't send).
            if (r.type !== "CUSTOM" && (!sessionDate || now.getTime() >= sessionDate.getTime())) {
                await prisma.reminder.update({ where: { id: r.id }, data: { status: "SENT" } });
                continue;
            }

            const latestReport = r.case.sessionReports[0];
            const { lawyer, customer } = buildMessages(r.type, {
                clientName: r.case.customer?.fullName,
                caseNumber: latestReport?.caseNumber ?? r.case.agencyNumber,
                court: latestReport?.courtName,
                sessionDate: r.case.sessionHijriDate,
                sessionTime: r.case.sessionTime,
                content: r.content,
            });

            const targets: { phone: string; message: string }[] =
                r.type === "CUSTOM"
                    ? resolveCustomRecipients(r.createdBy, r.case).map((phone) => ({ phone, message: lawyer }))
                    : [
                        ...(r.case.preferredLawyer?.phone ?? r.case.sessionReceiver?.phone
                            ? [
                                {
                                    phone: (r.case.preferredLawyer?.phone ??
                                        r.case.sessionReceiver?.phone)!,
                                    message: lawyer,
                                },
                            ]
                            : []),
                        ...(r.case.customer?.phone
                            ? [{ phone: r.case.customer.phone, message: customer }]
                            : []),
                    ];

            const failures: string[] = [];
            let anySuccess = false;
            for (const { phone, message } of targets) {
                try {
                    await sendWhatsAppMessage(phone, message);
                    anySuccess = true;
                } catch (e: any) {
                    failures.push(`${phone}: ${e?.message ?? "send failed"}`);
                }
            }

            const noRecipients = targets.length === 0;

            if (noRecipients) {
                await prisma.reminder.update({
                    where: { id: r.id },
                    data: {
                        status: "FAILED",
                        failureReason: "no recipient phone on file",
                    },
                });
                continue;
            }

            if (!anySuccess) {
                // Every attempted send failed — keep PENDING so the next tick retries.
                // Don't advance the schedule, set lastSentAt, or count it as sent.
                await prisma.reminder.update({
                    where: { id: r.id },
                    data: { failureReason: failures.join("; ") },
                });
                continue;
            }

            const next = computeNextReminderState(
                { repeat: r.repeat, repeatEveryHours: r.repeatEveryHours, scheduledAt: r.scheduledAt },
                r.type === "CUSTOM" ? null : sessionDate,
                now,
                r.type,
            );

            await prisma.reminder.update({
                where: { id: r.id },
                data: {
                    status: next.status,
                    scheduledAt: next.scheduledAt,
                    lastSentAt: next.lastSentAt,
                    sentCount: { increment: next.sentCountDelta },
                    failureReason: failures.length ? failures.join("; ") : null,
                },
            });
        }

        return { processed: due.length };
    }
}
