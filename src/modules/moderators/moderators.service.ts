import { Role } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import bcrypt from "bcrypt";
import { AppError } from "../../core/utils/AppError.js";
import { CreateModeratorSchema } from "./moderators.types.js";
import z from "zod";

export class ModeratorService {
    async createModerator(payload: z.infer<typeof CreateModeratorSchema>) {
        const { name, email, password } = payload;

        const userExists = await prisma.user.findUnique({ where: { email } });
        if (userExists) {
            throw new AppError("User already exists", 400, "AUTH_USER_ALREADY_EXISTS");
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const moderator = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: Role.MODERATOR,
                isVerified: true, // Auto-verify moderators created by admin
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        return moderator;
    }



    async getAllModerators() {
        // Pagination could be added here later
        const moderators = await prisma.user.findMany({
            where: { role: Role.MODERATOR },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isVerified: true,
                createdAt: true,
            },
        });
        return moderators;
    }

    async deleteModerator(id: string) {
        const moderator = await prisma.user.findUnique({ where: { id } });

        if (!moderator) {
            throw new AppError("Moderator not found", 404, "MODERATOR_NOT_FOUND");
        }

        if (moderator.role !== Role.ADMIN) {
            throw new AppError("Only Admin Can delete the moderators", 400, "INVALID_ROLE_OPERATION");
        }

        await prisma.user.delete({ where: { id } });
        return { message: "Moderator deleted successfully" };
    }
}
