import z from "zod";

export function parseTimeTo24h(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "AM" && hours === 12) hours = 0;
  if (period === "PM" && hours !== 12) hours += 12;
  return hours * 60 + minutes;
}

export const HolidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().min(1, "Name is required"),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isFullDay: z.boolean().nullable().optional().default(false).transform((val) => val ?? false),
})
  .refine((data) => {
    if (!data.isFullDay) {
      if (!data.startTime || !data.endTime) return false;
    }
    return true;
  }, {
    message: "startTime and endTime are required when isFullDay is false",
    path: ["startTime"],
  })
  .refine((data) => {
    if (data.startTime && data.endTime) {
      const start = parseTimeTo24h(data.startTime);
      const end = parseTimeTo24h(data.endTime);
      if (start === -1 || end === -1) return false;
      return start < end;
    }
    return true;
  }, {
    message: "Start time must be before end time",
    path: ["startTime"],
  });

export type HolidayPayload = z.infer<typeof HolidaySchema>;