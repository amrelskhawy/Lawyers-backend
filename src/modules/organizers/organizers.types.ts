import { z } from "zod";

export const CreateOrganizerSchema = z.object({
    userId: z.string().uuid("Invalid user ID format"),
});

export const UpdateOrganizerSchema = z.object({
    isActive: z.boolean(),
});

export type CreateOrganizerPayload = z.infer<typeof CreateOrganizerSchema>;
export type UpdateOrganizerPayload = z.infer<typeof UpdateOrganizerSchema>;
