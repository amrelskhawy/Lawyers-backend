import z from "zod";

export const BookingSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  // Optional at the request layer: installment-plan services are booked without a
  // date/time. The business validator (validateCreateBooking) enforces them for
  // normal services, since knowing whether a service is installment needs a DB lookup.
  date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" })
    .optional(),
  startTime: z.string().min(1, "Start time is required").optional(),
  endTime: z.string().optional(),
  clientEmail: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().min(1, "Phone number is required"),
  provider: z.enum(["STRIPE", "TABBY", "TAMARA", "PAYMOB"]).optional().default("STRIPE"),
});

export type CreateBookingInput = z.infer<typeof BookingSchema>;

export const ManualBookingSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  customerId: z.string().uuid("Invalid customer ID"),
});

export type CreateManualBookingInput = z.infer<typeof ManualBookingSchema>;