import type { TaskPriority, TaskStatus } from "@prisma/client";

/** Which half of "my tasks" the caller wants; omitted means both. */
export type TaskOwnership = "created" | "assigned";

export interface TaskFilters {
    mine?: TaskOwnership;
    status?: TaskStatus;
    priority?: TaskPriority;
    caseId?: string;
}

export interface CreateTaskPayload {
    title: string;
    description?: string | null;
    notes?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
    caseId?: string | null;
    assigneeIds?: string[];
    /** Turns the stand-in list on; with it off, `tempAssigneeIds` is ignored. */
    hasTempAssignee?: boolean;
    /** Who performs the task while an owner is away. */
    tempAssigneeIds?: string[];
    /** Honored only when the caller is an ADMIN or MODERATOR — see TasksService.create. */
    isVisibleForOtherAdmins?: boolean;
}

export type UpdateTaskPayload = Partial<CreateTaskPayload>;

/** The slice of a task an assignee may change: status and progress notes. */
export interface TaskProgressPayload {
    status?: TaskStatus;
    notes?: string | null;
}

/** The minimum a permission check needs to know about a task. */
export interface TaskParticipants {
    createdById: string;
    assignees: { userId: string }[];
}
