import { Role } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import bcrypt from "bcrypt";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateModeratorSchema } from "./moderators.types.js";
import { parseListQuery, buildMeta } from "../../core/utils/pagination.js";
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



    async getAllModerators(query: Record<string, unknown> = {}) {
        const select = {
            id: true,
            name: true,
            email: true,
            role: true,
            isVerified: true,
            createdAt: true,
        } as const;

        const isPaginated = query.page !== undefined || query.limit !== undefined;

        // OPT-IN: when no page/limit is provided, return the full array unchanged.
        if (!isPaginated) {
            const moderators = await prisma.user.findMany({
                where: { role: Role.MODERATOR },
                select,
            });
            return { data: moderators, meta: null };
        }

        const q = parseListQuery(query, { defaultLimit: 10 });

        const where: any = {
            AND: [
                { role: Role.MODERATOR },
            ],
        };

        if (q.search) {
            where.AND.push({
                OR: [
                    { name: { contains: q.search, mode: "insensitive" } },
                    { email: { contains: q.search, mode: "insensitive" } },
                    { phone: { contains: q.search, mode: "insensitive" } },
                ],
            });
        }

        const orderBy = q.sortBy ? { [q.sortBy]: q.sortOrder } : { createdAt: q.sortOrder };

        const [total, data] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({ where, select, orderBy, skip: q.skip, take: q.take }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
    }

    async deleteModerator(id: string) {
        const moderator = await prisma.user.findUnique({ where: { id } });

        if (!moderator) {
            throw new AppResponse(false, "MODERATOR_NOT_FOUND", null, 404);
        }

        await prisma.user.delete({ where: { id } });
        return { message: "MODERATOR_DELETED_SUCCESS" };
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
