import { CaseAssignmentStatus, Role } from "@prisma/client";
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
        const users = await prisma.user.findMany({
            select: USER_SELECT,
            where: role ? { role: role.toUpperCase() as Role } : undefined,
            orderBy: { createdAt: "desc" },
        });

        const userIds = users.map((u) => u.id);
        if (userIds.length === 0) return users;

        // Count accepted case assignments per user across both the lawyer slot
        // (preferredLawyer/assignmentStatus) and the consultant slot
        // (consultant/consultantAssignmentStatus), broken down by litigation
        // degree (caseDegree, null = not set yet).
        const [lawyerCounts, consultantCounts] = await Promise.all([
            prisma.case.groupBy({
                by: ["preferredLawyerId", "caseDegree"],
                where: {
                    preferredLawyerId: { in: userIds },
                    assignmentStatus: CaseAssignmentStatus.ACCEPTED,
                },
                _count: { _all: true },
            }),
            prisma.case.groupBy({
                by: ["consultantId", "caseDegree"],
                where: {
                    consultantId: { in: userIds },
                    consultantAssignmentStatus: CaseAssignmentStatus.ACCEPTED,
                },
                _count: { _all: true },
            }),
        ]);

        const countMap = new Map<string, number>();
        const degreeMap = new Map<string, Record<string, number>>();
        const add = (userId: string | null, degree: string | null, count: number) => {
            if (!userId) return;
            countMap.set(userId, (countMap.get(userId) ?? 0) + count);
            const byDegree = degreeMap.get(userId) ?? {};
            const key = degree ?? "UNASSIGNED";
            byDegree[key] = (byDegree[key] ?? 0) + count;
            degreeMap.set(userId, byDegree);
        };
        for (const row of lawyerCounts) {
            add(row.preferredLawyerId, row.caseDegree, row._count._all);
        }
        for (const row of consultantCounts) {
            add(row.consultantId, row.caseDegree, row._count._all);
        }

        return users.map((u) => ({
            ...u,
            acceptedCasesCount: countMap.get(u.id) ?? 0,
            acceptedCasesByDegree: degreeMap.get(u.id) ?? {},
        }));
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
