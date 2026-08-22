import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { Prisma, Role } from "@prisma/client";
import type {
    CreateTaskPayload,
    TaskFilters,
    TaskParticipants,
    TaskProgressPayload,
    UpdateTaskPayload,
} from "./tasks.types.js";

/**
 * The single source of truth for who can see a task: its creator and its
 * assignees, plus — only for an ADMIN/MODERATOR viewer — tasks another
 * ADMIN/MODERATOR opted to share via `isVisibleForOtherAdmins`. Everyone else
 * still gets exactly the creator/assignee scope, so this is not an admin-wide
 * task view, just an explicit, per-task opt-in for tracking purposes.
 */
export function buildTaskScopeWhere(
    user: { id: string; role: Role },
    filters: TaskFilters,
): Prisma.TaskWhereInput {
    const userId = user.id;
    const createdByMe: Prisma.TaskWhereInput = { createdById: userId };
    const assignedToMe: Prisma.TaskWhereInput = { assignees: { some: { userId } } };
    const isManager = user.role === "ADMIN" || user.role === "MODERATOR";

    const branches = [createdByMe, assignedToMe];
    if (isManager) branches.push({ isVisibleForOtherAdmins: true });

    const scope: Prisma.TaskWhereInput =
        filters.mine === "created"
            ? createdByMe
            : filters.mine === "assigned"
              ? assignedToMe
              : { OR: branches };

    const where: Prisma.TaskWhereInput = { ...scope };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.caseId) where.caseId = filters.caseId;
    return where;
}

/** Everyone the task belongs to: its creator plus the people doing the work. */
function isTaskParticipant(task: TaskParticipants, userId: string): boolean {
    return task.createdById === userId || task.assignees.some((a) => a.userId === userId);
}

/** Editing a task's own fields belongs to whoever created it. */
export function canEditTask(task: TaskParticipants, userId: string): boolean {
    return task.createdById === userId;
}

/** Moving a task along its status is open to the people doing the work. */
export function canChangeTaskStatus(task: TaskParticipants, userId: string): boolean {
    return isTaskParticipant(task, userId);
}

/** Progress notes are the assignees' half of the task. */
export function canEditTaskNotes(task: TaskParticipants, userId: string): boolean {
    return isTaskParticipant(task, userId);
}

/**
 * Deleting is the creator's right, extended to ADMIN and MODERATOR — but only
 * for tasks already in their scope. Strict visibility is not weakened here: a
 * task they cannot see is a task they cannot delete.
 */
export function canDeleteTask(task: TaskParticipants, user: { id: string; role: Role }): boolean {
    if (canEditTask(task, user.id)) return true;
    const isManager = user.role === "ADMIN" || user.role === "MODERATOR";
    return isManager && isTaskParticipant(task, user.id);
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

/** Who is acting — deletion depends on the caller's role, not just their id. */
type TaskActor = { id: string; role: Role };

export class TasksService {
    static async list(user: TaskActor, filters: TaskFilters) {
        return prisma.task.findMany({
            where: buildTaskScopeWhere(user, filters),
            include: taskInclude,
            orderBy: { createdAt: "desc" },
        });
    }

    /** Reads go through the scope filter, so an out-of-scope id is a 404, not a 403. */
    static async getOne(id: string, user: TaskActor) {
        const task = await prisma.task.findFirst({
            where: { id, ...buildTaskScopeWhere(user, {}) },
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

    static async create(user: TaskActor, payload: CreateTaskPayload) {
        await TasksService.assertAssigneesExist(payload.assigneeIds);
        return prisma.task.create({
            data: {
                title: payload.title,
                description: payload.description ?? null,
                notes: payload.notes ?? null,
                status: payload.status ?? "TODO",
                priority: payload.priority ?? "MEDIUM",
                dueDate: toDate(payload.dueDate),
                caseId: payload.caseId ?? null,
                createdById: user.id,
                // Only an ADMIN/MODERATOR creator may share the task with other
                // managers — everyone else's flag is silently dropped, never trusted
                // from the client alone.
                isVisibleForOtherAdmins: TasksService.canShareWithManagers(user, payload),
                assignees: { create: assigneeRows(payload.assigneeIds) },
            },
            include: taskInclude,
        });
    }

    static async update(id: string, user: TaskActor, payload: UpdateTaskPayload) {
        const task = await TasksService.findForPermissionCheck(id);
        if (!canEditTask(task, user.id)) throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
        await TasksService.assertAssigneesExist(payload.assigneeIds);

        const data: Prisma.TaskUpdateInput = {};
        if (payload.title !== undefined) data.title = payload.title;
        if (payload.description !== undefined) data.description = payload.description ?? null;
        if (payload.notes !== undefined) data.notes = payload.notes ?? null;
        if (payload.status !== undefined) data.status = payload.status;
        if (payload.priority !== undefined) data.priority = payload.priority;
        if (payload.dueDate !== undefined) data.dueDate = toDate(payload.dueDate);
        if (payload.isVisibleForOtherAdmins !== undefined) {
            data.isVisibleForOtherAdmins = TasksService.canShareWithManagers(user, payload);
        }
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

    /** The sharing checkbox only ever takes effect for an ADMIN/MODERATOR caller. */
    private static canShareWithManagers(user: TaskActor, payload: CreateTaskPayload | UpdateTaskPayload) {
        const isManager = user.role === "ADMIN" || user.role === "MODERATOR";
        return isManager && payload.isVisibleForOtherAdmins === true;
    }

    /**
     * The assignee-facing update: status and progress notes, nothing else. The
     * creator goes through here too — it is the only place notes are written.
     */
    static async updateProgress(id: string, userId: string, payload: TaskProgressPayload) {
        const task = await TasksService.findForPermissionCheck(id);

        const data: Prisma.TaskUpdateInput = {};
        if (payload.status !== undefined) {
            if (!canChangeTaskStatus(task, userId))
                throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
            data.status = payload.status;
        }
        if (payload.notes !== undefined) {
            if (!canEditTaskNotes(task, userId))
                throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
            data.notes = payload.notes ?? null;
        }
        if (Object.keys(data).length === 0)
            throw new AppResponse(false, "TASK_NOTHING_TO_UPDATE", null, 400);

        return prisma.task.update({ where: { id }, data, include: taskInclude });
    }

    static async remove(id: string, user: TaskActor) {
        const task = await TasksService.findForPermissionCheck(id);
        if (!canDeleteTask(task, user)) throw new AppResponse(false, "TASK_FORBIDDEN", null, 403);
        await prisma.task.delete({ where: { id } });
        return { id };
    }

    /** Bulk delete silently skips tasks the caller may not delete. */
    static async removeMany(ids: string[], user: TaskActor) {
        const isManager = user.role === "ADMIN" || user.role === "MODERATOR";
        const deletable: Prisma.TaskWhereInput[] = [{ createdById: user.id }];
        // Managers may also clear tasks they were assigned to, never ones they
        // cannot see.
        if (isManager) deletable.push({ assignees: { some: { userId: user.id } } });

        const result = await prisma.task.deleteMany({
            where: { id: { in: ids }, OR: deletable },
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
