import z from "zod";

export const WorkingDaySchema = z.object({
  id: z.string().optional(),
  day: z.string(),
  isOpen: z.boolean().default(true),
  startTime: z.string().default("09:00").optional(),
  endTime: z.string().default("17:00").optional(),
});

export const WorkdaysSchema = z.array(WorkingDaySchema);

export const UpdateWorkingDaySchema = z.object({
  data: WorkdaysSchema,
});
