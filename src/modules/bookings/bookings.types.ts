import z from "zod";

export const BookingSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  clientEmail: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().min(1, "Phone number is required"),
  provider: z.enum(["STRIPE", "TABBY"]).optional().default("STRIPE"),
});

export type CreateBookingInput = z.infer<typeof BookingSchema>;