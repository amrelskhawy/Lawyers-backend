import prisma from "../../core/db/prisma.js";

export class UsersService {
    async getUserById(id: string) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                photo: true,
                role: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new Error("User not found");
        }

        return user;
    }

    async updateUser(id: string, data: { name?: string; bio?: string; photo?: string }) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new Error("User not found");
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                name: data.name || user.name,
                photo: data.photo || user.photo,
            },
        });

        return {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            role: updated.role,
            photo: updated.photo,
            isVerified: updated.isVerified,
        };
    }

    async getAllUsers() {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                photo: true,
                role: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return users;
    }

    async deleteUser(id: string) {
        return await prisma.user.delete({ where: { id } });
    }
}
