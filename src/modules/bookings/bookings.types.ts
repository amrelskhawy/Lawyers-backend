import z from "zod";

export const BookingSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  clientEmail: z.string().email("Invalid email address"),
});

export type BookingPayload = z.infer<typeof BookingSchema>;
