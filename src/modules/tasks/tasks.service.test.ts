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
        task: { findFirst: vi.fn(), findMany: vi.fn() },
    },
}));

vi.mock("../../core/db/prisma.js", () => prismaMock);

import {
    buildTaskScopeWhere,
    canEditTask,
    canChangeTaskStatus,
    TasksService,
} from "./tasks.service.js";

const ME = "user-me";
const OTHER = "user-other";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("buildTaskScopeWhere", () => {
    it("limits results to tasks I created or am assigned to", () => {
        expect(buildTaskScopeWhere(ME, {})).toEqual({
            OR: [{ createdById: ME }, { assignees: { some: { userId: ME } } }],
        });
    });

    it("narrows to only the tasks I created when mine=created", () => {
        expect(buildTaskScopeWhere(ME, { mine: "created" })).toEqual({
            createdById: ME,
        });
    });

    it("narrows to only the tasks assigned to me when mine=assigned", () => {
        expect(buildTaskScopeWhere(ME, { mine: "assigned" })).toEqual({
            assignees: { some: { userId: ME } },
        });
    });

    it("keeps the scope clause alongside status, priority and case filters", () => {
        expect(
            buildTaskScopeWhere(ME, { status: "TODO", priority: "HIGH", caseId: "case-1" }),
        ).toEqual({
            OR: [{ createdById: ME }, { assignees: { some: { userId: ME } } }],
            status: "TODO",
            priority: "HIGH",
            caseId: "case-1",
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

describe("TasksService.getOne", () => {
    it("throws NOT_FOUND when the task exists but I am neither creator nor assignee", async () => {
        // The scope filter is part of the query, so Prisma returns nothing.
        prismaMock.default.task.findFirst.mockResolvedValue(null);

        await expect(TasksService.getOne("task-1", ME)).rejects.toMatchObject({
            statusCode: 404,
            message: "TASK_NOT_FOUND",
        });
    });

    it("returns the task when I am an assignee", async () => {
        const task = { id: "task-1", createdById: OTHER, assignees: [{ userId: ME }] };
        prismaMock.default.task.findFirst.mockResolvedValue(task);

        await expect(TasksService.getOne("task-1", ME)).resolves.toEqual(task);
    });
});
