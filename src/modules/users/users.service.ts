import prisma from "../../core/db/prisma.js";

export class UsersService {
    async getUserById(id: string) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
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

    async updateUser(id: string, data: { name?: string; }) {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new Error("User not found");
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                name: data.name || user.name,
            },
        });

        return {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            role: updated.role,
            isVerified: updated.isVerified,
        };
    }

    async getAllUsers(userRole: 'ALL' | 'ADMIN' | 'MODERATOR' = 'ALL') {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true,
            },
            where: userRole !== 'ALL' ? { role: userRole } : undefined,
        });
        return users;
    }

    async deleteUser(id: string) {
        return await prisma.user.delete({ where: { id } });
    }

    async deleteMultipleUsers(ids: string[]) {
        const results = await Promise
            .allSettled(ids.map((id) => this.deleteUser(id)));
        const deleted = ids
            .filter((_, i) => results[i].status === "fulfilled");
        const failed = ids
            .filter((_, i) => results[i].status === "rejected");

        return { deletedCount: deleted.length, failedIds: failed };
    }
}
