import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { Prisma } from "@prisma/client";
import type {
    CreateTaskPayload,
    TaskFilters,
    TaskParticipants,
    UpdateTaskPayload,
} from "./tasks.types.js";

/**
 * The single source of truth for who can see a task: its creator and its
 * assignees, nobody else. Deliberately role-blind — an ADMIN gets exactly the
 * same scope as a RECEPTIONIST, so there is no admin-wide task view.
 */
export function buildTaskScopeWhere(userId: string, filters: TaskFilters): Prisma.TaskWhereInput {
    const createdByMe: Prisma.TaskWhereInput = { createdById: userId };
    const assignedToMe: Prisma.TaskWhereInput = { assignees: { some: { userId } } };

    const scope: Prisma.TaskWhereInput =
        filters.mine === "created"
            ? createdByMe
            : filters.mine === "assigned"
              ? assignedToMe
              : { OR: [createdByMe, assignedToMe] };

    const where: Prisma.TaskWhereInput = { ...scope };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.caseId) where.caseId = filters.caseId;
    return where;
}

/** Editing and deleting a task belong to whoever created it. */
export function canEditTask(task: TaskParticipants, userId: string): boolean {
    return task.createdById === userId;
}

/** Moving a task along its status is open to the people doing the work. */
export function canChangeTaskStatus(task: TaskParticipants, userId: string): boolean {
    return canEditTask(task, userId) || task.assignees.some((a) => a.userId === userId);
}

const taskInclude = {
    createdBy: { select: { id: true, name: true, role: true } },
    assignees: {
        select: { userId: true, user: { select: { id: true, name: true, role: true } } },
    },
    case: { select: { id: true, caseType: true, customer: { select: { fullName: true } } } },
} satisfies Prisma.TaskInclude;

const assigneeRows = (ids: string[] | undefined) =>
    [...new Set(ids ?? [])].map((userId) => ({ userId }));

const toDate = (value: string | null | undefined) => (value ? new Date(value) : null);

export class TasksService {
    static async list(userId: string, filters: TaskFilters) {
        return prisma.task.findMany({
            where: buildTaskScopeWhere(userId, filters),
            include: taskInclude,
            orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        });
    }

    /** Reads go through the scope filter, so an out-of-scope id is a 404, not a 403. */
    static async getOne(id: string, userId: string) {
        const task = await prisma.task.findFirst({
            where: { id, ...buildTaskScopeWhere(userId, {}) },
            include: taskInclude,
        });
        if (!task) throw new AppResponse(false, "TASK_NOT_FOUND", null, 404);
        return task;
    }

    /** Staff to pick from when assigning. Any authenticated user may read it. */
    static async listAssignableUsers() {
        return prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: "asc" },
        });
    }

    static async create(userId: string, payload: CreateTaskPayload) {
        await TasksService.assertAssigneesExist(payload.assigneeIds);
        return prisma.task.create({
            data: {
                title: payload.title,
                description: payload.description ?? null,
                status: payload.status ?? "TODO",
                priority: payload.priority ?? "MEDIUM",
                dueDate: toDate(payload.dueDate),
                caseId: payload.caseId ?? null,
                createdById: userId,
                assignees: { create: assigneeRows(payload.assigneeIds) },
            },
            include: taskInclude,
        });
    }

    static async update(id: string, userId: string, payload: UpdateTaskPayload) {
        const task = await TasksService.findForPermissionCheck(id);
        if (!canEditTask(task, userId)) throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
        await TasksService.assertAssigneesExist(payload.assigneeIds);

        const data: Prisma.TaskUpdateInput = {};
        if (payload.title !== undefined) data.title = payload.title;
        if (payload.description !== undefined) data.description = payload.description ?? null;
        if (payload.status !== undefined) data.status = payload.status;
        if (payload.priority !== undefined) data.priority = payload.priority;
        if (payload.dueDate !== undefined) data.dueDate = toDate(payload.dueDate);
        if (payload.caseId !== undefined) {
            data.case = payload.caseId
                ? { connect: { id: payload.caseId } }
                : { disconnect: true };
        }
        // Reassigning replaces the whole set — the payload is the new roster.
        if (payload.assigneeIds !== undefined) {
            data.assignees = { deleteMany: {}, create: assigneeRows(payload.assigneeIds) };
        }

        return prisma.task.update({ where: { id }, data, include: taskInclude });
    }

    static async updateStatus(id: string, userId: string, status: CreateTaskPayload["status"]) {
        const task = await TasksService.findForPermissionCheck(id);
        if (!canChangeTaskStatus(task, userId))
            throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
        return prisma.task.update({ where: { id }, data: { status }, include: taskInclude });
    }

    static async remove(id: string, userId: string) {
        const task = await TasksService.findForPermissionCheck(id);
        if (!canEditTask(task, userId)) throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
        await prisma.task.delete({ where: { id } });
        return { id };
    }

    /** Bulk delete silently skips tasks the caller did not create. */
    static async removeMany(ids: string[], userId: string) {
        const result = await prisma.task.deleteMany({
            where: { id: { in: ids }, createdById: userId },
        });
        return { count: result.count };
    }

    private static async findForPermissionCheck(id: string) {
        const task = await prisma.task.findUnique({
            where: { id },
            select: { createdById: true, assignees: { select: { userId: true } } },
        });
        if (!task) throw new AppResponse(false, "TASK_NOT_FOUND", null, 404);
        return task;
    }

    private static async assertAssigneesExist(ids: string[] | undefined) {
        if (!ids?.length) return;
        const unique = [...new Set(ids)];
        const found = await prisma.user.count({ where: { id: { in: unique } } });
        if (found !== unique.length)
            throw new AppResponse(false, "TASK_ASSIGNEE_NOT_FOUND", null, 404);
    }
}
