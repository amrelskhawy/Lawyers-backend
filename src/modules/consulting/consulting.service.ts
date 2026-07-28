import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateConsultingPayload, UpdateConsultingPayload } from "./consulting.validator.js";
import { parseListQuery, buildMeta } from "../../core/utils/pagination.js";

export class ConsultingService {
    async listConsultingRecords(query: Record<string, unknown>) {
        const q = parseListQuery(query, { defaultLimit: 10 });

        const dateFrom = typeof query.dateFrom === "string" ? new Date(query.dateFrom) : undefined;
        const dateTo = typeof query.dateTo === "string" ? new Date(query.dateTo) : undefined;

        const where: Prisma.ConsultingRecordWhereInput = {
            isDeleted: false,
            ...(q.search
                ? {
                      OR: [
                          { clientName: { contains: q.search, mode: "insensitive" as const } },
                          { type: { contains: q.search, mode: "insensitive" as const } },
                      ],
                  }
                : {}),
            ...(dateFrom || dateTo
                ? {
                      date: {
                          ...(dateFrom ? { gte: dateFrom } : {}),
                          ...(dateTo ? { lte: dateTo } : {}),
                      },
                  }
                : {}),
        };

        const orderBy = q.sortBy ? { [q.sortBy]: q.sortOrder } : { date: "desc" as const };

        const [total, data] = await Promise.all([
            prisma.consultingRecord.count({ where }),
            prisma.consultingRecord.findMany({ where, orderBy, skip: q.skip, take: q.take }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
    }

    async getConsultingRecordById(id: string) {
        const record = await prisma.consultingRecord.findFirst({ where: { id, isDeleted: false } });

        if (!record) {
            throw new AppResponse(false, "CONSULTING_RECORD_NOT_FOUND", null, 404);
        }

        return record;
    }

    async createConsultingRecord(payload: CreateConsultingPayload, userId: string) {
        const record = await prisma.consultingRecord.create({
            data: {
                clientName: payload.clientName,
                date: payload.date,
                value: new Prisma.Decimal(payload.value),
                type: payload.type,
                createdById: userId,
                updatedById: userId,
            },
        });

        return record;
    }

    async updateConsultingRecord(id: string, payload: UpdateConsultingPayload, userId: string) {
        try {
            const updated = await prisma.consultingRecord.update({
                where: { id },
                data: {
                    ...payload,
                    value: payload.value !== undefined ? new Prisma.Decimal(payload.value) : undefined,
                    updatedById: userId,
                },
            });

            return updated;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new AppResponse(false, "CONSULTING_RECORD_NOT_FOUND", null, 404);
            }
            throw error;
        }
    }

    async deleteConsultingRecord(id: string) {
        const record = await prisma.consultingRecord.findFirst({ where: { id, isDeleted: false } });

        if (!record) {
            throw new AppResponse(false, "CONSULTING_RECORD_NOT_FOUND", null, 404);
        }

        await prisma.consultingRecord.update({ where: { id }, data: { isDeleted: true } });

        return { message: "CONSULTING_RECORD_DELETED_SUCCESS" };
    }

    async deleteMultipleConsultingRecords(ids: string[]) {
        const result = await prisma.consultingRecord.updateMany({
            where: { id: { in: ids } },
            data: { isDeleted: true },
        });

        return { deletedCount: result.count };
    }
}
