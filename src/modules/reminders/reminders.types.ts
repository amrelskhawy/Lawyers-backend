import { z } from "zod";

const ReminderTypeEnum = z.enum([
    "SESSION_DETAILS_REVIEW",
    "MEMO_REVIEW_UPLOAD",
    "URGENT_SESSION_SOON",
    "CUSTOM",
]);

const isoDateTime = z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date/time");

export const CreateReminderSchema = z
    .object({
        caseId: z.string().uuid(),
        type: ReminderTypeEnum,
        title: z.string().max(120).optional(),
        content: z.string().max(2000).optional(),
        scheduledAt: isoDateTime,
        repeat: z.boolean().optional().default(false),
        repeatEveryHours: z.number().int().min(1).max(720).optional(),
    })
    .refine((d) => !d.repeat || d.repeatEveryHours != null, {
        message: "repeatEveryHours is required when repeat is true",
        path: ["repeatEveryHours"],
    });

export const UpdateReminderSchema = z
    .object({
        type: ReminderTypeEnum.optional(),
        title: z.string().max(120).nullable().optional(),
        content: z.string().max(2000).nullable().optional(),
        scheduledAt: isoDateTime.optional(),
        repeat: z.boolean().optional(),
        repeatEveryHours: z.number().int().min(1).max(720).nullable().optional(),
    })
    .strict();

export type CreateReminderPayload = z.infer<typeof CreateReminderSchema>;
export type UpdateReminderPayload = z.infer<typeof UpdateReminderSchema>;
