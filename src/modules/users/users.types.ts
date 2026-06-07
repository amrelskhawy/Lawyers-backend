import { z } from "zod";

export const CreateUserSchema = z.object({
    name:     z.string().min(2),
    nameAr:   z.string().nullish(),
    nameEn:   z.string().nullish(),
    email:    z.string().email(),
    password: z.string().min(6),
    phone:    z.string().nullish(),
    location: z.string().nullish(),
    picture:  z.string().nullish(),
    role:     z.enum(["ADMIN", "MODERATOR", "RECEPTIONIST", "LAWYER", "CONSULTANT"]),
});

export const UpdateUserSchema = z.object({
    name:     z.string().min(2).optional(),
    nameAr:   z.string().nullish(),
    nameEn:   z.string().nullish(),
    phone:    z.string().nullish(),
    location: z.string().nullish(),
    picture:  z.string().nullish(),
    role:     z.enum(["ADMIN", "MODERATOR", "RECEPTIONIST", "LAWYER", "CONSULTANT"]).optional(),
    password: z.string().min(6).optional(),
});

export type CreateUserPayload = z.infer<typeof CreateUserSchema>;
export type UpdateUserPayload = z.infer<typeof UpdateUserSchema>;
