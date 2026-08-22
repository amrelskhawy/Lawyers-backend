import { z } from "zod";

const statusEnum = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const CreateTaskSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueDate: z.string().datetime().nullable().optional(),
    caseId: z.string().uuid("Invalid case ID").nullable().optional(),
    assigneeIds: z.array(z.string().uuid("Invalid user ID")).optional(),
    isVisibleForOtherAdmins: z.boolean().optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial();

/** What an assignee may change: status, progress notes, or both. */
export const UpdateTaskProgressSchema = z
    .object({
        status: statusEnum.optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((body) => body.status !== undefined || body.notes !== undefined, {
        message: "Provide a status or notes to update",
    });
