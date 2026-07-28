import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateConsultingPayload, UpdateConsultingPayload } from "./consulting.validator.js";
import { parseListQuery, buildMeta } from "../../core/utils/pagination.js";

/** Whole-year or single-month UTC range, for the year/month period picker. */
function periodRange(query: Record<string, unknown>): { gte?: Date; lt?: Date } {
    const year = query.year !== undefined ? Number.parseInt(String(query.year), 10) : undefined;
    if (!year || Number.isNaN(year)) return {};

    const month = query.month !== undefined ? Number.parseInt(String(query.month), 10) : undefined;
    if (month && !Number.isNaN(month)) {
        return {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
        };
    }

    return {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
    };
}

function dateFilter(query: Record<string, unknown>): Prisma.DateTimeFilter | undefined {
    const { gte, lt } = periodRange(query);
    const dateFrom = typeof query.dateFrom === "string" ? new Date(query.dateFrom) : undefined;
    const dateTo = typeof query.dateTo === "string" ? new Date(query.dateTo) : undefined;

    if (!gte && !lt && !dateFrom && !dateTo) return undefined;

    return {
        ...(gte ? { gte } : dateFrom ? { gte: dateFrom } : {}),
        ...(lt ? { lt } : dateTo ? { lte: dateTo } : {}),
    };
}

function searchFilter(search: string): Prisma.ConsultingRecordWhereInput["OR"] | undefined {
    if (!search) return undefined;
    return [
        { clientName: { contains: search, mode: "insensitive" as const } },
        { type: { contains: search, mode: "insensitive" as const } },
    ];
}

export class ConsultingService {
    async listConsultingRecords(query: Record<string, unknown>) {
        const q = parseListQuery(query, { defaultLimit: 10 });
        const date = dateFilter(query);
        const OR = searchFilter(q.search);

        const where: Prisma.ConsultingRecordWhereInput = {
            isDeleted: false,
            ...(OR ? { OR } : {}),
            ...(date ? { date } : {}),
        };

        const orderBy = q.sortBy ? { [q.sortBy]: q.sortOrder } : { date: "desc" as const };

        const [total, data] = await Promise.all([
            prisma.consultingRecord.count({ where }),
            prisma.consultingRecord.findMany({ where, orderBy, skip: q.skip, take: q.take }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
    }

    /** Count + total value for the selected period/search — drives the KPI cards. */
    async getSummary(query: Record<string, unknown>) {
        const date = dateFilter(query);
        const search = typeof query.search === "string" ? query.search.trim() : "";
        const OR = searchFilter(search);

        const where: Prisma.ConsultingRecordWhereInput = {
            isDeleted: false,
            ...(OR ? { OR } : {}),
            ...(date ? { date } : {}),
        };

        const [count, aggregate] = await Promise.all([
            prisma.consultingRecord.count({ where }),
            prisma.consultingRecord.aggregate({ where, _sum: { value: true } }),
        ]);

        return {
            count,
            total: Number(aggregate._sum.value ?? 0),
        };
    }

    /** Years that actually have consulting records, newest first — drives the year picker. */
    async getAvailableYears(): Promise<number[]> {
        const rows = await prisma.consultingRecord.findMany({
            where: { isDeleted: false },
            select: { date: true },
        });
        const years = new Set<number>();
        for (const r of rows) years.add(r.date.getUTCFullYear());
        return [...years].sort((a, b) => b - a);
    }

    async getConsultingRecordById(id: string) {
        const record = await prisma.consultingRecord.findFirst({ where: { id, isDeleted: false } });

        if (!record) {
            throw new AppResponse(false, "CONSULTING_RECORD_NOT_FOUND", null, 404);
        }

        return record;
    }

    async createConsultingRecord(payload: CreateConsultingPayload, userId: string) {
        const customer = await prisma.customer.findFirst({
            where: { id: payload.customerId, isDeleted: false },
        });

        if (!customer) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        const record = await prisma.consultingRecord.create({
            data: {
                customerId: customer.id,
                clientName: customer.fullName,
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
        let clientName: string | undefined;

        if (payload.customerId !== undefined) {
            const customer = await prisma.customer.findFirst({
                where: { id: payload.customerId, isDeleted: false },
            });

            if (!customer) {
                throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
            }

            clientName = customer.fullName;
        }

        try {
            const updated = await prisma.consultingRecord.update({
                where: { id },
                data: {
                    ...payload,
                    clientName,
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
