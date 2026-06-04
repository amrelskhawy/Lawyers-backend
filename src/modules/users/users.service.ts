import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateUserPayload, UpdateUserPayload } from "./users.types.js";

const USER_SELECT = {
    id: true,
    name: true,
    nameAr: true,
    nameEn: true,
    phone: true,
    location: true,
    picture: true,
    email: true,
    role: true,
    isVerified: true,
    createdAt: true,
    updatedAt: true,
} as const;

export class UsersService {
    async getUserById(id: string) {
        const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!user) throw new AppResponse(false, "USER_NOT_FOUND", null, 404);
        return user;
    }

    async getAllUsers(role?: string) {
        return prisma.user.findMany({
            select: USER_SELECT,
            where: role ? { role: role.toUpperCase() as Role } : undefined,
            orderBy: { createdAt: "desc" },
        });
    }

    async createUser(data: CreateUserPayload) {
        const exists = await prisma.user.findUnique({ where: { email: data.email } });
        if (exists) throw new AppResponse(false, "AUTH_USER_ALREADY_EXISTS", null, 409);

        const { password, ...rest } = data;
        return prisma.user.create({
            data: { ...rest, password: await bcrypt.hash(password, 10), isVerified: true },
            select: USER_SELECT,
        });
    }

    async updateUser(id: string, data: UpdateUserPayload) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new AppResponse(false, "USER_NOT_FOUND", null, 404);

        const { password, ...rest } = data;
        const updateData = {
            ...rest,
            ...(password && { password: await bcrypt.hash(password, 10) }),
        };

        return prisma.user.update({ where: { id }, data: updateData, select: USER_SELECT });
    }

    async deleteUser(id: string) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new AppResponse(false, "USER_NOT_FOUND", null, 404);
        return prisma.user.delete({ where: { id } });
    }

    async deleteMultipleUsers(ids: string[]) {
        const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } });
        return { deletedCount: count };
    }
}
