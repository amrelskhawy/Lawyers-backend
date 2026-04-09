import { Role } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import bcrypt from "bcrypt";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateModeratorSchema } from "./moderators.types.js";
import z from "zod";

export class ModeratorService {
    async createModerator(payload: z.infer<typeof CreateModeratorSchema>) {
        const { name, email, password } = payload;

        const userExists = await prisma.user.findUnique({ where: { email } });
        if (userExists) {
            throw new AppResponse(false, "AUTH_USER_ALREADY_EXISTS", null, 400);
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
            throw new AppResponse(false, "MODERATOR_NOT_FOUND", null, 404);
        }

        await prisma.user.delete({ where: { id } });
        return { message: "Moderator deleted successfully" };
    }

    async deleteMultipleModerators(ids: string[]) {
        const result = await prisma.user.deleteMany({
            where: {
                id: { in: ids },
                role: Role.MODERATOR,
            },
        });
        return result;
    }
}
