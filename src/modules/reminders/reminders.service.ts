import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { sendWhatsAppMessage } from "../../core/services/waapi/waapi.service.js";
import { buildMessages } from "./reminders.messages.js";
import type { CreateReminderPayload, UpdateReminderPayload } from "./reminders.types.js";
import type { Role } from "@prisma/client";

type NextStateInput = {
    repeat: boolean;
    repeatEveryHours: number | null;
    scheduledAt: Date;
};

/**
 * Pure decision for what a reminder's state becomes after a send at `now`.
 * Enforces the "always end before the next session" rule for repeats.
 */
export function computeNextReminderState(
    r: NextStateInput,
    sessionDate: Date,
    now: Date,
): { status: "PENDING" | "SENT"; scheduledAt: Date; lastSentAt: Date; sentCountDelta: number } {
    if (!r.repeat || !r.repeatEveryHours) {
        return { status: "SENT", scheduledAt: r.scheduledAt, lastSentAt: now, sentCountDelta: 1 };
    }
    const nextAt = new Date(now.getTime() + r.repeatEveryHours * 60 * 60 * 1000);
    if (nextAt.getTime() >= sessionDate.getTime()) {
        return { status: "SENT", scheduledAt: r.scheduledAt, lastSentAt: now, sentCountDelta: 1 };
    }
    return { status: "PENDING", scheduledAt: nextAt, lastSentAt: now, sentCountDelta: 1 };
}

const STAFF: Role[] = ["ADMIN", "MODERATOR"];

/** Throw 404/403 unless the case exists and the actor may manage its reminders. */
async function assertCaseAccess(caseId: string, user: { id: string; role: Role }) {
    const c = await prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, sessionDate: true, preferredLawyerId: true, sessionReceiverId: true, isDeleted: true },
    });
    if (!c || c.isDeleted) throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
    if (user.role === "LAWYER" && c.preferredLawyerId !== user.id && c.sessionReceiverId !== user.id) {
        throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
    }
    if (!STAFF.includes(user.role) && user.role !== "LAWYER") {
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
        if (!c.sessionDate) {
            throw new AppResponse(false, "REMINDER_SESSION_DATE_REQUIRED", null, 400);
        }
        const scheduledAt = new Date(payload.scheduledAt);
        if (scheduledAt.getTime() <= Date.now()) {
            throw new AppResponse(false, "REMINDER_SCHEDULE_IN_PAST", null, 400);
        }
        if (scheduledAt.getTime() >= c.sessionDate.getTime()) {
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
        const existing = await prisma.reminder.findUnique({ where: { id }, select: { caseId: true } });
        if (!existing) throw new AppResponse(false, "REMINDER_NOT_FOUND", null, 404);
        const c = await assertCaseAccess(existing.caseId, user);

        const data: Record<string, unknown> = { ...payload };
        if (payload.scheduledAt) {
            const scheduledAt = new Date(payload.scheduledAt);
            if (c.sessionDate && scheduledAt.getTime() >= c.sessionDate.getTime()) {
                throw new AppResponse(false, "REMINDER_AFTER_SESSION", null, 400);
            }
            data.scheduledAt = scheduledAt;
        }
        return prisma.reminder.update({ where: { id }, data });
    }

    async remove(id: string, user: { id: string; role: Role }) {
        const existing = await prisma.reminder.findUnique({ where: { id }, select: { caseId: true } });
        if (!existing) throw new AppResponse(false, "REMINDER_NOT_FOUND", null, 404);
        await assertCaseAccess(existing.caseId, user);
        await prisma.reminder.delete({ where: { id } });
        return { id };
    }

    /**
     * Find every due reminder and send it. Best-effort: a send failure is
     * recorded on the row and never throws out of the loop.
     */
    async processDueReminders(now: Date = new Date()) {
        const due = await prisma.reminder.findMany({
            where: { status: "PENDING", scheduledAt: { lte: now } },
            include: {
                case: {
                    select: {
                        sessionDate: true,
                        sessionHijriDate: true,
                        sessionTime: true,
                        agencyNumber: true,
                        customer: { select: { fullName: true, phone: true } },
                        preferredLawyer: { select: { phone: true } },
                        sessionReceiver: { select: { phone: true } },
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
            if (!sessionDate || now.getTime() >= sessionDate.getTime()) {
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
            const lawyerPhone = r.case.preferredLawyer?.phone ?? r.case.sessionReceiver?.phone ?? null;
            const customerPhone = r.case.customer?.phone ?? null;

            const failures: string[] = [];
            let anySuccess = false;
            if (lawyerPhone) {
                try {
                    await sendWhatsAppMessage(lawyerPhone, lawyer);
                    anySuccess = true;
                } catch (e: any) {
                    failures.push(`lawyer: ${e?.message ?? "send failed"}`);
                }
            }
            if (customerPhone) {
                try {
                    await sendWhatsAppMessage(customerPhone, customer);
                    anySuccess = true;
                } catch (e: any) {
                    failures.push(`customer: ${e?.message ?? "send failed"}`);
                }
            }

            const noRecipients = !lawyerPhone && !customerPhone;

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
                sessionDate,
                now,
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
