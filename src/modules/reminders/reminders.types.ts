import { z } from "zod";

const ReminderTypeEnum = z.enum([
    "SESSION_DETAILS_REVIEW",
    "MEMO_REVIEW_UPLOAD",
    "URGENT_SESSION_SOON",
    "CUSTOM",
]);

// The schedule is entered as a Hijri (Umm al-Qura) date + time-of-day, mirroring
// how the case session date is set. The backend converts it to the Gregorian
// `scheduledAt` instant via `hijriToGregorian`, so reminders resolve and fire the
// same way as the auto-scheduled session reminders.
const hijriDate = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "Expected Hijri date as iYYYY-iMM-iDD");
const timeOfDay = z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/, "Expected time as HH:mm");

export const CreateReminderSchema = z
    .object({
        caseId: z.string().uuid(),
        type: ReminderTypeEnum,
        title: z.string().max(120).optional(),
        content: z.string().max(2000).optional(),
        hijriDate,
        time: timeOfDay,
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
        hijriDate: hijriDate.optional(),
        time: timeOfDay.optional(),
        repeat: z.boolean().optional(),
        repeatEveryHours: z.number().int().min(1).max(720).nullable().optional(),
    })
    .strict()
    // The reschedule date and time travel together — reject a half-update.
    .refine((d) => (d.hijriDate == null) === (d.time == null), {
        message: "hijriDate and time must be provided together",
        path: ["time"],
    });

export type CreateReminderPayload = z.infer<typeof CreateReminderSchema>;
export type UpdateReminderPayload = z.infer<typeof UpdateReminderSchema>;
