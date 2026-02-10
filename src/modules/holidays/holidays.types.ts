import z from "zod";

export const HolidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().min(1, "Name is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isFullDay: z.boolean().optional().default(false),
})
  .refine((data) => {
    if (data.startTime && !data.endTime) return false;
    if (!data.startTime && data.endTime) return false;
    return true;
  }, {
    message: "Both start time and end time must be provided (or neither)",
    path: ["startTime"],
  })
  .refine((data) => {
    if (data.startTime && data.endTime && data.startTime >= data.endTime) {
      return false;
    }
    return true;
  }, {
    message: "Start time must be before end time",
    path: ["startTime"],
  });

export type HolidayPayload = z.infer<typeof HolidaySchema>;