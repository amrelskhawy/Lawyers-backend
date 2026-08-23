import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { sendWhatsAppFile, sendWhatsAppMessage } from "../../core/services/waapi/waapi.service.js";
import { renderCaseReportPdf } from "./case-pdf.service.js";
import { buildOutstandingBalanceMessage } from "./cases.messages.js";
import { round2, sumAmounts, toAmount } from "../../core/utils/money.js";
import { hijriToGregorian, hijriMonthRange } from "../../core/utils/hijri.js";
import { parseListQuery, buildMeta } from "../../core/utils/pagination.js";
import type { CaseType, CaseDegree } from "@prisma/client";
import { scheduleSessionReminders, cancelSessionReminders } from "../reminders/reminders.scheduler.js";
import { ensureCustomerFolder } from "../../core/services/google/customer-folder.js";
import type {
    CreateCasePayload,
    UpdateCasePayload,
    AssignCasePayload,
    SetSessionDatePayload,
    SetCaseDegreePayload,
    SetCourtInfoPayload,
    SetStandInPayload,
} from "./cases.validator.js";

const caseInclude = {
    customer: {
        select: { id: true, fullName: true, email: true, phone: true, caseReportsFolderId: true },
    },
    preferredLawyer: { select: { id: true, name: true } },
    consultant: { select: { id: true, name: true } },
    tempLawyer: { select: { id: true, name: true } },
    tempConsultant: { select: { id: true, name: true } },
    sessionReceiver: { select: { id: true, name: true } },
    sourceLawyer: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CaseInclude;

/**
 * Outcome of the balance-reminder WhatsApp attached to a case-close response,
 * so the dashboard can tell staff whether the client was actually notified.
 */
export interface BalanceNotification {
    /** Money still owed on the case's contracts, in SAR. */
    remaining: number;
    sent: boolean;
    phone?: string;
    /** Why no message went out despite the case closing successfully. */
    skippedReason?: "NO_BALANCE" | "NO_PHONE";
    error?: string;
}

/**
 * The source lawyer only exists for non-company clients. A company client never
 * keeps one (toggling `isCompany` back on clears it), and a lawyer-sourced client
 * must name the lawyer who brought them.
 */
function resolveSourceLawyer(isCompany: boolean, sourceLawyerId: string | null): string | null {
    if (isCompany) return null;
    if (!sourceLawyerId) {
        throw new AppResponse(false, "CASE_SOURCE_LAWYER_REQUIRED", null, 400);
    }
    return sourceLawyerId;
}

type AssignmentKind = "LAWYER" | "CONSULTANT";

/** Map a user's role to the assignment slot they occupy. */
function kindFromRole(role: string): AssignmentKind {
    return role === "CONSULTANT" ? "CONSULTANT" : "LAWYER";
}

/** Read the current assignee id + status for one slot of a case row. */
function slotState(c: { preferredLawyerId: string | null; assignmentStatus: string; consultantId: string | null; consultantAssignmentStatus: string }, kind: AssignmentKind) {
    return kind === "CONSULTANT"
        ? { assigneeId: c.consultantId, status: c.consultantAssignmentStatus }
        : { assigneeId: c.preferredLawyerId, status: c.assignmentStatus };
}

/** Fields that clear a slot's stand-in — used when the slot itself is emptied. */
function clearStandIn(kind: AssignmentKind): Prisma.CaseUpdateInput {
    return kind === "CONSULTANT"
        ? { tempConsultant: { disconnect: true }, tempConsultantName: null }
        : { tempLawyer: { disconnect: true }, tempLawyerName: null };
}

/**
 * Whoever may work this case from the lawyer side: the assigned lawyer, their
 * stand-in, or the lawyer receiving the session. A stand-in acts with the slot
 * holder's rights — that is the whole point of naming one.
 */
function isCaseWorker(
    c: { preferredLawyerId: string | null; tempLawyerId: string | null; sessionReceiverId: string | null },
    userId: string,
) {
    return (
        c.preferredLawyerId === userId ||
        c.tempLawyerId === userId ||
        c.sessionReceiverId === userId
    );
}

type RequestingUser = { id: string; role: string };

/** Options for {@link CasesService.list} — calendar window, pagination + filters. */
export interface CaseListOptions {
    hijriYear?: number;
    hijriMonth?: number;
    /** Calendar range as canonical Hijri dates "iYYYY-iMM-iDD"; `toHijri` is exclusive. */
    fromHijri?: string;
    toHijri?: string;
    query?: Record<string, unknown>;
    search?: string;
    caseType?: CaseType;
    /** A `CaseDegree`, or the sentinel "UNASSIGNED" for cases with no degree. */
    caseDegree?: CaseDegree | "UNASSIGNED";
    lawyerId?: string;
    /** When true, restrict to cases that have been marked completed (closedAt IS NOT NULL). */
    onlyClosed?: boolean;
    /** Split the case list by the real-customer flag: true → Client Cases, false → Customer Meetings. */
    isRealCustomer?: boolean;
    /** Restrict to one customer's cases — used by the fee-contract case picker. */
    customerId?: string;
}

export class CasesService {
    /**
     * Build the Prisma `where` for a case list, combining role scoping, the
     * calendar month window, free-text search and the column filters. Uses an
     * `AND` array so the (role) and (search) OR-groups don't collide.
     */
    private buildListWhere(
        requestingUser: RequestingUser,
        opts: CaseListOptions,
    ): Prisma.CaseWhereInput {
        const and: Prisma.CaseWhereInput[] = [{ isDeleted: false }];

        if (requestingUser.role === "LAWYER" || requestingUser.role === "CONSULTANT") {
            and.push({
                OR: [
                    { preferredLawyerId: requestingUser.id },
                    { consultantId: requestingUser.id },
                    // Stand-ins see the case for as long as they are covering a slot.
                    { tempLawyerId: requestingUser.id },
                    { tempConsultantId: requestingUser.id },
                ],
            });
        }

        // Calendar: restrict to sessions within a Hijri window via the reliable
        // Gregorian `sessionDate` (cases without a session are naturally excluded).
        // An explicit from/to range (day/week/month/year views) takes precedence;
        // otherwise fall back to a single Hijri month.
        if (opts.fromHijri && opts.toHijri) {
            and.push({
                sessionDate: {
                    gte: hijriToGregorian(opts.fromHijri, "00:00"),
                    lt: hijriToGregorian(opts.toHijri, "00:00"),
                },
            });
        } else if (opts.hijriYear && opts.hijriMonth) {
            const { start, end } = hijriMonthRange(opts.hijriYear, opts.hijriMonth);
            and.push({ sessionDate: { gte: start, lt: end } });
        }

        if (opts.search) {
            const contains = { contains: opts.search, mode: "insensitive" as const };
            and.push({
                OR: [
                    { customer: { fullName: contains } },
                    { agencyNumber: contains },
                    { preferredLawyerName: contains },
                    { consultantName: contains },
                    { tempLawyerName: contains },
                    { tempConsultantName: contains },
                ],
            });
        }

        if (opts.customerId) and.push({ customerId: opts.customerId });
        if (opts.isRealCustomer !== undefined) and.push({ isRealCustomer: opts.isRealCustomer });
        if (opts.caseType) and.push({ caseType: opts.caseType });
        if (opts.caseDegree === "UNASSIGNED") and.push({ caseDegree: null });
        else if (opts.caseDegree) and.push({ caseDegree: opts.caseDegree });
        if (opts.lawyerId) {
            and.push({
                OR: [
                    { preferredLawyerId: opts.lawyerId },
                    { consultantId: opts.lawyerId },
                    { tempLawyerId: opts.lawyerId },
                    { tempConsultantId: opts.lawyerId },
                ],
            });
        }

        return { AND: and };
    }

    async list(requestingUser: RequestingUser, opts: CaseListOptions = {}) {
        const where = this.buildListWhere(requestingUser, opts);

        // Calendar path: the month view needs every case in the window, unpaginated.
        // Also the default when no pagination is requested (keeps non-dashboard
        // callers — e.g. stats — getting the full array, unchanged).
        const wantsPage =
            opts.query != null && (opts.query.page != null || opts.query.limit != null);
        const isCalendar =
            (opts.hijriYear != null && opts.hijriMonth != null) ||
            (opts.fromHijri != null && opts.toHijri != null);
        if (isCalendar || !wantsPage) {
            const data = await prisma.case.findMany({
                where,
                include: caseInclude,
                orderBy: { createdAt: "desc" },
            });
            return { data, meta: null };
        }

        // Table path: paginate and attach summary counts for the dashboard cards.
        // `where` carries the role/search/degree/lawyer filters only. With no filter
        // active at all, the table shows everything (open + closed). Activating the
        // "closed" toggle narrows to closed cases; activating a degree card narrows
        // to open cases in that degree — matching the (always open-only) card counts,
        // so a closed case is never shown under a degree it's no longer counted in.
        const q = parseListQuery(opts.query ?? {}, { defaultLimit: 10 });
        const openWhere: Prisma.CaseWhereInput = { AND: [where, { completedAt: null }] };
        const listWhere: Prisma.CaseWhereInput = opts.onlyClosed
            ? { AND: [where, { completedAt: { not: null } }] }
            : opts.caseDegree
              ? openWhere
              : where;
        const [total, data, degreeGroups, pendingCount, closedCount] = await Promise.all([
            prisma.case.count({ where: listWhere }),
            prisma.case.findMany({
                where: listWhere,
                include: caseInclude,
                orderBy: { createdAt: "desc" },
                skip: q.skip,
                take: q.take,
            }),
            prisma.case.groupBy({ by: ["caseDegree"], where: openWhere, _count: { _all: true } }),
            this.countPendingForUser(requestingUser, where),
            prisma.case.count({ where: { AND: [where, { completedAt: { not: null } }] } }),
        ]);

        const degreeCounts: Record<string, number> = {};
        for (const g of degreeGroups) {
            degreeCounts[g.caseDegree ?? "UNASSIGNED"] = g._count._all;
        }

        return {
            data,
            meta: { ...buildMeta(total, q.page, q.limit), degreeCounts, pendingCount, closedCount },
        };
    }

    /**
     * List cases that need a session scheduled: either none was ever set
     * (`sessionDate` is null), or the one that was set has already elapsed
     * (`sessionDate` < now — the stored Gregorian instant carries the time, so
     * this is a full datetime comparison). Closed cases (`completedAt` set) are
     * always excluded — a closed case is done and never needs (re)scheduling.
     *
     * Reuses the standard list filters (role scoping, search, caseType,
     * caseDegree, lawyerId). Paginates when `page`/`limit` are supplied;
     * otherwise returns the full array (meta: null), mirroring
     * {@link CasesService.list}.
     */
    async listUnscheduled(requestingUser: RequestingUser, opts: CaseListOptions = {}) {
        // A closed case is done and never needs (re)scheduling, so exclude it
        // regardless of whether a session was ever set.
        const needsScheduling: Prisma.CaseWhereInput = {
            completedAt: null,
            OR: [{ sessionDate: null }, { sessionDate: { lt: new Date() } }],
        };

        // The list honours the active degree filter; the degree cards, however, are
        // counted over the same unscheduled scope WITHOUT that filter so every card
        // keeps showing its full total while one is selected.
        const baseWhere: Prisma.CaseWhereInput = {
            AND: [
                this.buildListWhere(requestingUser, { ...opts, caseDegree: undefined }),
                needsScheduling,
            ],
        };
        const where: Prisma.CaseWhereInput = {
            AND: [this.buildListWhere(requestingUser, opts), needsScheduling],
        };

        const wantsPage =
            opts.query != null && (opts.query.page != null || opts.query.limit != null);
        if (!wantsPage) {
            const data = await prisma.case.findMany({
                where,
                include: caseInclude,
                orderBy: { createdAt: "desc" },
            });
            return { data, meta: null };
        }

        const q = parseListQuery(opts.query ?? {}, { defaultLimit: 10 });
        const [total, data, degreeGroups] = await Promise.all([
            prisma.case.count({ where }),
            prisma.case.findMany({
                where,
                include: caseInclude,
                orderBy: { createdAt: "desc" },
                skip: q.skip,
                take: q.take,
            }),
            prisma.case.groupBy({ by: ["caseDegree"], where: baseWhere, _count: { _all: true } }),
        ]);

        const degreeCounts: Record<string, number> = {};
        for (const g of degreeGroups) {
            degreeCounts[g.caseDegree ?? "UNASSIGNED"] = g._count._all;
        }

        return { data, meta: { ...buildMeta(total, q.page, q.limit), degreeCounts } };
    }

    /** Cases still awaiting accept/reject in the requesting user's own slot. */
    private async countPendingForUser(
        requestingUser: RequestingUser,
        where: Prisma.CaseWhereInput,
    ): Promise<number> {
        if (requestingUser.role === "LAWYER") {
            return prisma.case.count({
                where: { AND: [where, { preferredLawyerId: requestingUser.id, assignmentStatus: "PENDING" }] },
            });
        }
        if (requestingUser.role === "CONSULTANT") {
            return prisma.case.count({
                where: {
                    AND: [where, { consultantId: requestingUser.id, consultantAssignmentStatus: "PENDING" }],
                },
            });
        }
        return 0;
    }

    async listLawyers() {
        return prisma.user.findMany({
            where: { role: { in: ["LAWYER", "CONSULTANT"] } },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: "asc" },
        });
    }

    /** Every staff user (any role) — used to populate the case "source" picker. */
    async listStaff() {
        return prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: "asc" },
        });
    }

    async getById(id: string, requestingUser: RequestingUser) {
        const c = await prisma.case.findUnique({
            where: { id },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (
            (requestingUser.role === "LAWYER" || requestingUser.role === "CONSULTANT") &&
            c.preferredLawyerId !== requestingUser.id &&
            c.consultantId !== requestingUser.id &&
            c.tempLawyerId !== requestingUser.id &&
            c.tempConsultantId !== requestingUser.id
        ) {
            throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
        }
        return c;
    }

    async create(payload: CreateCasePayload, createdById: string) {
        // Verify customer exists and is not deleted
        const customer = await prisma.customer.findUnique({
            where: { id: payload.customerId },
        });
        if (!customer || customer.isDeleted) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        const isCompany = payload.isCompany ?? true;
        const sourceLawyerId = resolveSourceLawyer(isCompany, payload.sourceLawyerId ?? null);

        return prisma.case.create({
            data: {
                customerId: payload.customerId,
                sourceLawyerId,
                caseType: payload.caseType,
                otherCaseType: payload.caseType === "OTHER" ? payload.otherCaseType : null,
                caseDate: new Date(payload.caseDate),
                hijriDate: payload.hijriDate ?? null,
                agencyNumber: payload.agencyNumber ?? null,
                isRealCustomer: payload.isRealCustomer ?? false,
                isCompany,
                createdById,
            },
            include: caseInclude,
        });
    }
    async update(id: string, payload: UpdateCasePayload, updatedById: string, updaterRole: string) {
        const existing = await prisma.case.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        // Lawyers and consultants can only edit cases they have accepted (in their own slot)
        if (updaterRole === "LAWYER" || updaterRole === "CONSULTANT") {
            const { assigneeId, status } = slotState(existing, kindFromRole(updaterRole));
            if (assigneeId !== updatedById) {
                throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
            }
            if (status !== "ACCEPTED") {
                throw new AppResponse(false, "CASE_ASSIGNMENT_NOT_ACCEPTED", null, 403);
            }
        }

        const data: Prisma.CaseUpdateInput = {};
        if (payload.customerId !== undefined) {
            data.customer = { connect: { id: payload.customerId } };
        }
        if (payload.caseType !== undefined) data.caseType = payload.caseType;
        if (payload.otherCaseType !== undefined) data.otherCaseType = payload.otherCaseType;
        if (payload.caseDate !== undefined) data.caseDate = new Date(payload.caseDate);
        if (payload.hijriDate !== undefined) data.hijriDate = payload.hijriDate;
        if (payload.agencyNumber !== undefined) data.agencyNumber = payload.agencyNumber;
        if (payload.isRealCustomer !== undefined) data.isRealCustomer = payload.isRealCustomer;
        if (payload.isCompany !== undefined) data.isCompany = payload.isCompany;
        // Validate the source lawyer against the *merged* state: a PATCH may carry
        // either field alone. Untouched cases are left as-is so pre-existing rows
        // without a source lawyer stay editable.
        if (payload.isCompany !== undefined || payload.sourceLawyerId !== undefined) {
            const isCompany = payload.isCompany ?? existing.isCompany;
            const submittedId =
                payload.sourceLawyerId !== undefined
                    ? payload.sourceLawyerId
                    : existing.sourceLawyerId;
            const sourceLawyerId = resolveSourceLawyer(isCompany, submittedId);
            data.sourceLawyer = sourceLawyerId
                ? { connect: { id: sourceLawyerId } }
                : { disconnect: true };
        }
        if (payload.sessionReceiverId !== undefined) {
            data.sessionReceiver = payload.sessionReceiverId
                ? { connect: { id: payload.sessionReceiverId } }
                : { disconnect: true };
        }
        if (payload.sessionReceiverName !== undefined) {
            data.sessionReceiverName = payload.sessionReceiverName;
        }
        if (payload.hasStructuredNotes !== undefined) data.hasStructuredNotes = payload.hasStructuredNotes;
        if (payload.weaknesses !== undefined) data.weaknesses = payload.weaknesses;
        if (payload.strengths !== undefined) data.strengths = payload.strengths;
        if (payload.gaps !== undefined) data.gaps = payload.gaps;
        if (payload.freeNotes !== undefined) data.freeNotes = payload.freeNotes;

        data.updatedBy = { connect: { id: updatedById } };

        return prisma.case.update({
            where: { id },
            data,
            include: caseInclude,
        });
    }

    async assign(caseId: string, payload: AssignCasePayload, assignedById: string) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        const kind = payload.kind;
        const { status } = slotState(existing, kind);
        if (status === "PENDING" || status === "ACCEPTED") {
            throw new AppResponse(false, "CASE_ALREADY_ASSIGNED", null, 409);
        }

        const user = await prisma.user.findUnique({ where: { id: payload.lawyerId } });
        // The picked user must exist AND hold the role matching the chosen slot.
        if (!user || user.role !== kind) {
            throw new AppResponse(false, "CASE_ASSIGN_INVALID_LAWYER", null, 400);
        }

        const data: Prisma.CaseUpdateInput =
            kind === "CONSULTANT"
                ? {
                    consultant: { connect: { id: payload.lawyerId } },
                    consultantName: payload.lawyerName ?? user.name,
                    consultantAssignmentStatus: "PENDING",
                    consultantAssignmentRejectedAt: null,
                    consultantAssignmentRejectionReason: null,
                }
                : {
                    wantsSpecificLawyer: true,
                    preferredLawyer: { connect: { id: payload.lawyerId } },
                    preferredLawyerName: payload.lawyerName ?? user.name,
                    assignmentStatus: "PENDING",
                    assignmentRejectedAt: null,
                    assignmentRejectionReason: null,
                };

        return prisma.case.update({
            where: { id: caseId },
            data: { ...data, updatedBy: { connect: { id: assignedById } } },
            include: caseInclude,
        });
    }

    async acceptAssignment(caseId: string, userId: string, role: string) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        const kind = kindFromRole(role);
        const { assigneeId, status } = slotState(existing, kind);
        if (assigneeId !== userId) {
            throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
        }
        if (status !== "PENDING") {
            throw new AppResponse(false, "CASE_ASSIGNMENT_NOT_PENDING", null, 400);
        }

        const data: Prisma.CaseUpdateInput =
            kind === "CONSULTANT"
                ? { consultantAssignmentStatus: "ACCEPTED" }
                : { assignmentStatus: "ACCEPTED" };

        return prisma.case.update({
            where: { id: caseId },
            data: { ...data, updatedBy: { connect: { id: userId } } },
            include: caseInclude,
        });
    }

    async rejectAssignment(caseId: string, userId: string, reason: string, role: string) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        const kind = kindFromRole(role);
        const { assigneeId, status } = slotState(existing, kind);
        if (assigneeId !== userId) {
            throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
        }
        if (status !== "PENDING") {
            throw new AppResponse(false, "CASE_ASSIGNMENT_NOT_PENDING", null, 400);
        }

        const data: Prisma.CaseUpdateInput =
            kind === "CONSULTANT"
                ? {
                    consultantAssignmentStatus: "REJECTED",
                    consultantAssignmentRejectedAt: new Date(),
                    consultantAssignmentRejectionReason: reason,
                    consultant: { disconnect: true },
                    consultantName: null,
                }
                : {
                    assignmentStatus: "REJECTED",
                    assignmentRejectedAt: new Date(),
                    assignmentRejectionReason: reason,
                    preferredLawyer: { disconnect: true },
                    preferredLawyerName: null,
                    wantsSpecificLawyer: false,
                };

        return prisma.case.update({
            where: { id: caseId },
            data: { ...data, updatedBy: { connect: { id: userId } } },
            include: caseInclude,
        });
    }

    /**
     * Name — or clear — the person covering one slot while its holder is away.
     * Unlike a real assignment this takes effect at once: a stand-in has no
     * accept/reject lifecycle of their own, they simply step in. Passing a null
     * `userId` clears the slot's stand-in.
     */
    async setStandIn(caseId: string, payload: SetStandInPayload, actorId: string) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        const kind = payload.kind;
        const { assigneeId, status } = slotState(existing, kind);

        if (payload.userId == null) {
            return prisma.case.update({
                where: { id: caseId },
                data: { ...clearStandIn(kind), updatedBy: { connect: { id: actorId } } },
                include: caseInclude,
            });
        }

        // Nobody covers an empty slot — there is no holder to stand in for.
        if (status !== "PENDING" && status !== "ACCEPTED") {
            throw new AppResponse(false, "CASE_NOT_ASSIGNED", null, 400);
        }
        if (payload.userId === assigneeId) {
            throw new AppResponse(false, "CASE_STAND_IN_IS_ASSIGNEE", null, 400);
        }

        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        // A stand-in holds the same role as the slot they cover.
        if (!user || user.role !== kind) {
            throw new AppResponse(false, "CASE_ASSIGN_INVALID_LAWYER", null, 400);
        }

        const data: Prisma.CaseUpdateInput =
            kind === "CONSULTANT"
                ? {
                    tempConsultant: { connect: { id: payload.userId } },
                    tempConsultantName: payload.userName ?? user.name,
                }
                : {
                    tempLawyer: { connect: { id: payload.userId } },
                    tempLawyerName: payload.userName ?? user.name,
                };

        return prisma.case.update({
            where: { id: caseId },
            data: { ...data, updatedBy: { connect: { id: actorId } } },
            include: caseInclude,
        });
    }

    async unassign(caseId: string, unassignedById: string, kind: AssignmentKind) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        const { status } = slotState(existing, kind);
        if (status !== "PENDING" && status !== "ACCEPTED") {
            throw new AppResponse(false, "CASE_NOT_ASSIGNED", null, 400);
        }

        const data: Prisma.CaseUpdateInput =
            kind === "CONSULTANT"
                ? {
                    consultantAssignmentStatus: "UNASSIGNED",
                    consultantAssignmentRejectedAt: null,
                    consultantAssignmentRejectionReason: null,
                    consultant: { disconnect: true },
                    consultantName: null,
                }
                : {
                    assignmentStatus: "UNASSIGNED",
                    assignmentRejectedAt: null,
                    assignmentRejectionReason: null,
                    preferredLawyer: { disconnect: true },
                    preferredLawyerName: null,
                    wantsSpecificLawyer: false,
                };

        return prisma.case.update({
            where: { id: caseId },
            // Emptying a slot leaves nobody to stand in for.
            data: {
                ...data,
                ...clearStandIn(kind),
                updatedBy: { connect: { id: unassignedById } },
            },
            include: caseInclude,
        });
    }

    /**
     * Set the case's (Hijri) session date + time. Converts to the Gregorian
     * instant used for scheduling, persists both, then (re)schedules the 3
     * auto reminders against the new date. Lawyers may only do this for cases
     * they've accepted; staff may always.
     */
    async setSessionDate(
        caseId: string,
        payload: SetSessionDatePayload,
        userId: string,
        userRole: string,
    ) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (existing.completedAt) {
            throw new AppResponse(false, "CASE_COMPLETED", null, 400);
        }
        if (userRole === "LAWYER" || userRole === "CONSULTANT") {
            if (!isCaseWorker(existing, userId)) {
                throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
            }
            if (existing.assignmentStatus !== "ACCEPTED") {
                throw new AppResponse(false, "CASE_ASSIGNMENT_NOT_ACCEPTED", null, 403);
            }
        }

        // Clearing the session date (both fields null) — wipe it and cancel the
        // still-pending auto reminders that were scheduled against it.
        if (payload.sessionHijriDate == null || payload.sessionTime == null) {
            const cleared = await prisma.case.update({
                where: { id: caseId },
                data: {
                    sessionHijriDate: null,
                    sessionTime: null,
                    sessionDate: null,
                    updatedBy: { connect: { id: userId } },
                },
                include: caseInclude,
            });
            await cancelSessionReminders(caseId);
            return cleared;
        }

        let sessionDate: Date;
        try {
            sessionDate = hijriToGregorian(payload.sessionHijriDate, payload.sessionTime);
        } catch {
            throw new AppResponse(false, "CASE_INVALID_HIJRI_DATE", null, 400);
        }
        if (sessionDate.getTime() <= Date.now()) {
            throw new AppResponse(false, "CASE_SESSION_DATE_IN_PAST", null, 400);
        }

        const updated = await prisma.case.update({
            where: { id: caseId },
            data: {
                sessionHijriDate: payload.sessionHijriDate,
                sessionTime: payload.sessionTime,
                sessionDate,
                updatedBy: { connect: { id: userId } },
            },
            include: caseInclude,
        });

        await scheduleSessionReminders(caseId, sessionDate, userId);

        return updated;
    }

    async remove(id: string) {
        const existing = await prisma.case.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        await prisma.case.update({ where: { id }, data: { isDeleted: true } });
        return { message: "CASE_DELETED_SUCCESS" };
    }

    /**
     * Money still owed on *this case* = Σ(contract totalFees) − Σ(collected
     * payments) over the contracts linked to it. Deleted contracts and deleted
     * payments are excluded, matching how the financials module reports debt.
     *
     * Scope is strictly `caseId`. The client's other contracts — including ones
     * with no case link at all — are somebody else's balance and must never be
     * folded into this case's closing reminder.
     *
     * Phone and name both come from a contract that still carries a balance
     * (that is who signed for the money); the customer record is the fallback
     * when contracts were created without them.
     */
    private async getOutstandingBalance(caseId: string) {
        const contracts = await prisma.lawyerFeesContract.findMany({
            where: { caseId, isDeleted: false },
            select: {
                clientName: true,
                clientPhone: true,
                totalFees: true,
                payments: { where: { isDeleted: false }, select: { amount: true } },
            },
        });

        let remaining = 0;
        let contractPhone: string | null = null;
        let contractName: string | null = null;
        for (const c of contracts) {
            const owed = round2(toAmount(c.totalFees) - sumAmounts(c.payments.map((p) => p.amount)));
            if (owed <= 0) continue;
            remaining = round2(remaining + owed);
            contractPhone ??= c.clientPhone?.trim() || null;
            contractName ??= c.clientName?.trim() || null;
        }

        return { remaining, contractPhone, contractName };
    }

    /**
     * Best-effort WhatsApp reminder of the balance left on a just-closed case.
     * A WAAPI failure is reported back to the caller rather than thrown, so a
     * dead provider can never undo a close that already committed.
     */
    private async notifyOutstandingBalance(
        caseId: string,
        customerPhone: string | null,
        customerName: string | null,
    ): Promise<BalanceNotification> {
        const { remaining, contractPhone, contractName } = await this.getOutstandingBalance(caseId);
        if (remaining <= 0) {
            return { remaining, sent: false, skippedReason: "NO_BALANCE" };
        }

        const phone = contractPhone ?? customerPhone?.trim() ?? null;
        if (!phone) {
            return { remaining, sent: false, skippedReason: "NO_PHONE" };
        }

        const name = contractName ?? customerName?.trim() ?? null;
        try {
            await sendWhatsAppMessage(phone, buildOutstandingBalanceMessage(remaining, name));
            return { remaining, sent: true, phone };
        } catch (e: any) {
            return { remaining, sent: false, phone, error: e?.message ?? "WhatsApp send failed" };
        }
    }

    /**
     * Toggle the case's "fully completed" state. Completing cancels every still
     * PENDING reminder (the scheduler only sends PENDING, so cancelled ones are
     * never delivered) and blocks new reminder actions. Reopening clears the
     * flag but does not recreate the cancelled reminders.
     */
    async setCompletion(
        caseId: string,
        completed: boolean,
        userId: string,
        userRole: string,
    ) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (userRole === "LAWYER" || userRole === "CONSULTANT") {
            if (!isCaseWorker(existing, userId)) {
                throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
            }
        }

        const updated = await prisma.$transaction(async (tx) => {
            if (completed) {
                await tx.reminder.updateMany({
                    where: { caseId, status: "PENDING" },
                    data: { status: "CANCELLED" },
                });
            }
            return tx.case.update({
                where: { id: caseId },
                data: {
                    completedAt: completed ? new Date() : null,
                    completedBy: completed
                        ? { connect: { id: userId } }
                        : { disconnect: true },
                    updatedBy: { connect: { id: userId } },
                },
                include: caseInclude,
            });
        });

        if (!completed) return updated;

        // Runs after the commit and never rethrows — the case is already closed,
        // and a WhatsApp/WAAPI failure must not turn that into a failed request.
        const balanceNotification = await this.notifyOutstandingBalance(
            caseId,
            updated.customer?.phone ?? null,
            updated.customer?.fullName ?? null,
        ).catch((e: any) => ({
            remaining: 0,
            sent: false,
            error: e?.message ?? "balance lookup failed",
        }) satisfies BalanceNotification);

        return { ...updated, balanceNotification };
    }

    /**
     * Set the case's litigation degree (درجة التقاضي). Lawyers/consultants may
     * only do this for cases assigned to them; staff may always.
     */
    async setDegree(
        caseId: string,
        payload: SetCaseDegreePayload,
        userId: string,
        userRole: string,
    ) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (userRole === "LAWYER" || userRole === "CONSULTANT") {
            if (!isCaseWorker(existing, userId)) {
                throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
            }
        }

        return prisma.case.update({
            where: { id: caseId },
            data: {
                caseDegree: payload.caseDegree,
                otherDegreeText: payload.caseDegree === "OTHER" ? (payload.otherDegreeText ?? null) : null,
                updatedBy: { connect: { id: userId } },
            },
            include: caseInclude,
        });
    }

    /**
     * Persist the court (المحكمة) + case number (رقم القضية) from the reminders
     * dialog. Both feed the reminder messages and gate reminder dispatch — a
     * reminder is never sent to the client while either is missing. Empty input
     * is normalised to null (cleared).
     */
    async setCourtInfo(
        caseId: string,
        payload: SetCourtInfoPayload,
        userId: string,
        userRole: string,
    ) {
        const existing = await prisma.case.findUnique({ where: { id: caseId } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (existing.completedAt) {
            throw new AppResponse(false, "CASE_COMPLETED", null, 400);
        }
        if (userRole === "LAWYER" || userRole === "CONSULTANT") {
            if (!isCaseWorker(existing, userId)) {
                throw new AppResponse(false, "CASE_NOT_ASSIGNED_TO_YOU", null, 403);
            }
        }

        const norm = (v: string | null | undefined): string | null | undefined => {
            if (v === undefined) return undefined;
            const trimmed = v?.trim();
            return trimmed ? trimmed : null;
        };

        return prisma.case.update({
            where: { id: caseId },
            data: {
                ...(payload.courtName !== undefined ? { courtName: norm(payload.courtName) } : {}),
                ...(payload.caseNumber !== undefined ? { caseNumber: norm(payload.caseNumber) } : {}),
                updatedBy: { connect: { id: userId } },
            },
            include: caseInclude,
        });
    }

    private ensureCustomerFolder(customerId: string): Promise<string> {
        return ensureCustomerFolder(customerId);
    }

    /**
     * A report is "fresh" when a Drive file already exists for it AND the case
     * hasn't been updated since that file was generated. In that case we can
     * skip the expensive render+upload and reuse the existing file.
     */
    private isReportFresh(c: { reportFileId: string | null; reportGeneratedAt: Date | null; updatedAt: Date }): boolean {
        return !!c.reportFileId && !!c.reportGeneratedAt && c.updatedAt <= c.reportGeneratedAt;
    }

    private async deleteOldReportFile(fileId: string | null) {
        if (!fileId) return;
        try {
            await driveService.deleteFile(fileId);
        } catch (err) {
            console.error("Old report Drive delete failed (non-blocking):", err);
        }
    }

    /**
     * Generate the case report PDF, upload it to the customer's Drive folder,
     * and persist the resulting file id + URL on the case row.
     *
     * If a report file already exists and the case hasn't changed since it
     * was generated, this is a no-op: we return the existing case row with
     * `regenerated: false` so the caller can tell the user nothing changed.
     *
     * Otherwise the stale Drive file (if any) is deleted before the new one
     * is uploaded, so we never accumulate orphaned duplicates.
     */
    async generateAndUploadPdf(caseId: string) {
        const c = await prisma.case.findUnique({
            where: { id: caseId },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        if (this.isReportFresh(c)) {
            return { data: c, regenerated: false };
        }

        await this.deleteOldReportFile(c.reportFileId);

        const folderId = await this.ensureCustomerFolder(c.customerId);
        const buffer = await renderCaseReportPdf(c);

        const fileName = `case-report-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);

        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const updated = await prisma.case.update({
            where: { id: caseId },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
                reportGeneratedAt: new Date(),
            },
            include: caseInclude,
        });
        return { data: updated, regenerated: true };
    }

    /**
     * Send the case report to the customer via WhatsApp (required) and email (optional).
     *
     * Mirrors the freshness logic of `generateAndUploadPdf`: if the case hasn't
     * changed since the last render we reuse the existing Drive file (downloading
     * the buffer for the email attachment) instead of regenerating. Otherwise
     * we delete the old file, render a new PDF, upload it, and send.
     */
    async sendToClient(caseId: string) {
        const c = await prisma.case.findUnique({
            where: { id: caseId },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (!c.customer?.phone) {
            throw new AppResponse(false, "CUSTOMER_PHONE_MISSING", null, 400);
        }

        let fileId: string;
        let webViewLink: string | null;
        let buffer: Buffer;
        let regenerated: boolean;

        if (this.isReportFresh(c)) {
            fileId = c.reportFileId!;
            webViewLink = c.reportUrl;
            buffer = await driveService.downloadFile(fileId);
            regenerated = false;
        } else {
            await this.deleteOldReportFile(c.reportFileId);

            const folderId = await this.ensureCustomerFolder(c.customerId);
            buffer = await renderCaseReportPdf(c);

            const fileName = `case-report-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
            const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
            if (!uploaded.id) {
                throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
            }
            fileId = uploaded.id;
            webViewLink = uploaded.webViewLink ?? null;
            regenerated = true;
        }

        const publicUrl = await driveService.makePublic(fileId);

        // WhatsApp is required — send the PDF via WhatsApp
        await sendWhatsAppFile(
            c.customer.phone,
            publicUrl,
            `تقرير القضية - شركة سعد البقمي\n${c.customer.fullName}`,
        );

        // Email is optional — send only if the customer has an email
        if (c.customer.email) {
            try {
                await sendEmailWithTemplate(
                    c.customer.email,
                    "تقرير القضية - شركة سعد البقمي",
                    "caseReport",
                    { customerName: c.customer.fullName },
                    [
                        {
                            filename: `case-report-${c.id.slice(0, 8)}.pdf`,
                            content: buffer,
                            contentType: "application/pdf",
                        },
                    ],
                );
            } catch (err) {
                console.error("Email send failed (non-blocking):", err);
            }
        }

        const updateData: Prisma.CaseUpdateInput = { sentToClientAt: new Date() };
        if (regenerated) {
            updateData.reportFileId = fileId;
            updateData.reportUrl = webViewLink;
            updateData.reportGeneratedAt = new Date();
        }

        const updated = await prisma.case.update({
            where: { id: caseId },
            data: updateData,
            include: caseInclude,
        });
        return { data: updated, regenerated };
    }
}
