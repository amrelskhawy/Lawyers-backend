import z from "zod";

export interface UserResponse {
    id: string;
    name: string;
    email: string;
    role: string | null;
    isVerified: boolean;
    token?: string;
}

export interface RegisterPayload {
    name: string;
    email: string;
    password: string;
}

export const LoginSchema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginPayload = z.infer<typeof LoginSchema>;

export const UserSchema = z.object({
    name: z
        .string()
        .min(3, "Name must be at least 3 characters")
        .max(50, "Name cannot exceed 50 characters")
        .trim(),

    email: z
        .string()
        .email("Invalid email"),

    password: z
        .string()
        .min(8, "Password must be at least 8 characters") // Senior standard is 8+
    // .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    // .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    // .regex(/[0-9]/, "Password must contain at least one number")
    // .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
})
export const UpdateUserSchema = UserSchema.partial();

