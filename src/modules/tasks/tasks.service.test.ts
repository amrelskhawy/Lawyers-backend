/**
 * tasks.service.test.ts — the strict visibility rule and the permission split.
 *
 * A task is readable ONLY by its creator and its assignees. There is no
 * admin-wide view: an ADMIN who is neither gets the same empty result as
 * anyone else. These tests pin that down.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
    default: {
        task: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        user: { count: vi.fn() },
    },
}));

vi.mock("../../core/db/prisma.js", () => prismaMock);

import {
    buildTaskScopeWhere,
    canEditTask,
    canChangeTaskStatus,
    canEditTaskNotes,
    canDeleteTask,
    TasksService,
} from "./tasks.service.js";

const ME = "user-me";
const OTHER = "user-other";
const ME_USER = { id: ME, role: "LAWYER" as const };
const ME_ADMIN = { id: ME, role: "ADMIN" as const };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("buildTaskScopeWhere", () => {
    it("limits results to tasks I created or am assigned to", () => {
        expect(buildTaskScopeWhere(ME_USER, {})).toEqual({
            OR: [{ createdById: ME }, { assignees: { some: { userId: ME } } }],
        });
    });

    it("narrows to only the tasks I created when mine=created", () => {
        expect(buildTaskScopeWhere(ME_USER, { mine: "created" })).toEqual({
            createdById: ME,
        });
    });

    it("narrows to only the tasks assigned to me when mine=assigned", () => {
        expect(buildTaskScopeWhere(ME_USER, { mine: "assigned" })).toEqual({
            assignees: { some: { userId: ME } },
        });
    });

    it("keeps the scope clause alongside status, priority and case filters", () => {
        expect(
            buildTaskScopeWhere(ME_USER, { status: "TODO", priority: "HIGH", caseId: "case-1" }),
        ).toEqual({
            OR: [{ createdById: ME }, { assignees: { some: { userId: ME } } }],
            status: "TODO",
            priority: "HIGH",
            caseId: "case-1",
        });
    });

    it("adds the shared-with-managers branch for an ADMIN/MODERATOR viewer", () => {
        expect(buildTaskScopeWhere(ME_ADMIN, {})).toEqual({
            OR: [
                { createdById: ME },
                { assignees: { some: { userId: ME } } },
                { isVisibleForOtherAdmins: true },
            ],
        });
    });

    it("does not add the shared-with-managers branch for a non-manager viewer", () => {
        expect(buildTaskScopeWhere(ME_USER, {})).toEqual({
            OR: [{ createdById: ME }, { assignees: { some: { userId: ME } } }],
        });
    });
});

describe("canEditTask", () => {
    it("allows the creator", () => {
        expect(canEditTask({ createdById: ME, assignees: [] }, ME)).toBe(true);
    });

    it("denies an assignee who did not create the task", () => {
        expect(canEditTask({ createdById: OTHER, assignees: [{ userId: ME }] }, ME)).toBe(false);
    });
});

describe("canChangeTaskStatus", () => {
    it("allows the creator", () => {
        expect(canChangeTaskStatus({ createdById: ME, assignees: [] }, ME)).toBe(true);
    });

    it("allows an assignee", () => {
        expect(canChangeTaskStatus({ createdById: OTHER, assignees: [{ userId: ME }] }, ME)).toBe(
            true,
        );
    });

    it("denies someone who is neither creator nor assignee", () => {
        expect(canChangeTaskStatus({ createdById: OTHER, assignees: [] }, ME)).toBe(false);
    });
});

describe("canEditTaskNotes", () => {
    it("allows the creator", () => {
        expect(canEditTaskNotes({ createdById: ME, assignees: [] }, ME)).toBe(true);
    });

    it("allows an assignee — notes are where they report progress", () => {
        expect(canEditTaskNotes({ createdById: OTHER, assignees: [{ userId: ME }] }, ME)).toBe(true);
    });

    it("denies someone who is neither creator nor assignee", () => {
        expect(canEditTaskNotes({ createdById: OTHER, assignees: [] }, ME)).toBe(false);
    });
});

describe("canDeleteTask", () => {
    it("allows the creator whatever their role", () => {
        const task = { createdById: ME, assignees: [] };
        expect(canDeleteTask(task, { id: ME, role: "LAWYER" })).toBe(true);
    });

    it("allows an ADMIN who is an assignee", () => {
        const task = { createdById: OTHER, assignees: [{ userId: ME }] };
        expect(canDeleteTask(task, { id: ME, role: "ADMIN" })).toBe(true);
    });

    it("allows a MODERATOR who is an assignee", () => {
        const task = { createdById: OTHER, assignees: [{ userId: ME }] };
        expect(canDeleteTask(task, { id: ME, role: "MODERATOR" })).toBe(true);
    });

    it("denies an ADMIN who is neither creator nor assignee", () => {
        // Strict visibility holds: a task outside their scope stays untouchable.
        const task = { createdById: OTHER, assignees: [] };
        expect(canDeleteTask(task, { id: ME, role: "ADMIN" })).toBe(false);
    });

    it("denies a plain assignee who is not ADMIN or MODERATOR", () => {
        const task = { createdById: OTHER, assignees: [{ userId: ME }] };
        expect(canDeleteTask(task, { id: ME, role: "LAWYER" })).toBe(false);
    });
});

describe("TasksService.getOne", () => {
    it("throws NOT_FOUND when the task exists but I am neither creator nor assignee", async () => {
        // The scope filter is part of the query, so Prisma returns nothing.
        prismaMock.default.task.findFirst.mockResolvedValue(null);

        await expect(TasksService.getOne("task-1", ME_USER)).rejects.toMatchObject({
            statusCode: 404,
            message: "TASK_NOT_FOUND",
        });
    });

    it("returns the task when I am an assignee", async () => {
        const task = { id: "task-1", createdById: OTHER, assignees: [{ userId: ME }] };
        prismaMock.default.task.findFirst.mockResolvedValue(task);

        await expect(TasksService.getOne("task-1", ME_USER)).resolves.toEqual(task);
    });
});

describe("TasksService.create — sharing with other managers", () => {
    it("honors isVisibleForOtherAdmins when the creator is an ADMIN", async () => {
        prismaMock.default.task.create.mockResolvedValue({});

        await TasksService.create(ME_ADMIN, { title: "t", isVisibleForOtherAdmins: true });

        expect(prismaMock.default.task.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ isVisibleForOtherAdmins: true }) }),
        );
    });

    it("drops isVisibleForOtherAdmins when the creator is not an ADMIN/MODERATOR", async () => {
        prismaMock.default.task.create.mockResolvedValue({});

        await TasksService.create(ME_USER, { title: "t", isVisibleForOtherAdmins: true });

        expect(prismaMock.default.task.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ isVisibleForOtherAdmins: false }) }),
        );
    });
});

describe("TasksService.update — sharing with other managers", () => {
    beforeEach(() => {
        prismaMock.default.task.findUnique.mockResolvedValue({ createdById: ME, assignees: [] });
        prismaMock.default.task.update.mockResolvedValue({});
    });

    it("lets an ADMIN creator turn sharing on", async () => {
        await TasksService.update("task-1", ME_ADMIN, { isVisibleForOtherAdmins: true });

        expect(prismaMock.default.task.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ isVisibleForOtherAdmins: true }) }),
        );
    });

    it("ignores the flag for a non-manager creator", async () => {
        await TasksService.update("task-1", ME_USER, { isVisibleForOtherAdmins: true });

        expect(prismaMock.default.task.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ isVisibleForOtherAdmins: false }) }),
        );
    });
});
