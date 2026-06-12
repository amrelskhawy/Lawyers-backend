import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateServicePayload, UpdateServicePayload } from "./services.validator.js";
import z from "zod";
import { appEvents, SystemEvents } from "../../core/utils/events.js";
import { parseListQuery, buildMeta } from "../../core/utils/pagination.js";

export class ServiceService {
    async getAllServices() {
        const services = await prisma.service.findMany({
            orderBy: { createdAt: "desc" },
        });
        return services;
    }

    /**
     * Opt-in paginated list. When the query has `page` or `limit`, returns one
     * page plus pagination `meta`. Otherwise returns the FULL list (unchanged
     * from {@link getAllServices}) with `meta = null` so the public website /
     * landing page keeps receiving every service.
     */
    async listServices(query: Record<string, unknown>) {
        const isPaginated = query.page !== undefined || query.limit !== undefined;

        if (!isPaginated) {
            const data = await this.getAllServices();
            return { data, meta: null };
        }

        const q = parseListQuery(query, { defaultLimit: 10 });

        const where = q.search
            ? {
                  AND: [
                      {
                          OR: [
                              { name_ar: { contains: q.search, mode: "insensitive" as const } },
                              { name_en: { contains: q.search, mode: "insensitive" as const } },
                              { description_ar: { contains: q.search, mode: "insensitive" as const } },
                              { description_en: { contains: q.search, mode: "insensitive" as const } },
                          ],
                      },
                  ],
              }
            : {};

        const orderBy = q.sortBy
            ? { [q.sortBy]: q.sortOrder }
            : { createdAt: "desc" as const };

        const [total, data] = await Promise.all([
            prisma.service.count({ where }),
            prisma.service.findMany({ where, orderBy, skip: q.skip, take: q.take }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
    }

    async getServiceById(id: string) {
        const service = await prisma.service.findUnique({
            where: { id },
        });

        if (!service) {
            throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
        }

        return service;
    }

    async createService(payload: CreateServicePayload) {
        const service = await prisma.service.create({
            data: {
                name_ar: payload.name_ar,
                name_en: payload.name_en,
                description_ar: payload.description_ar,
                description_en: payload.description_en,
                price: payload.price !== undefined ? new Prisma.Decimal(payload.price) : null,
                isFree: payload.isFree ?? false,
            },
        });

        appEvents.emitDataChange(SystemEvents.SERVICE_CREATED, { serviceId: service.id });

        return service;
    }

    async updateService(id: string, payload: UpdateServicePayload) {
        try {
            const updatedService = await prisma.service.update({
                where: { id },
                data: {
                    ...payload,
                    price: payload.price !== undefined ? new Prisma.Decimal(payload.price) : undefined,
                },
            });

            appEvents.emitDataChange(SystemEvents.SERVICE_UPDATED, { serviceId: updatedService.id });

            return updatedService;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
            }
            throw error;
        }
    }

    async toggleServiceStatus(id: string) {
        const service = await prisma.service.findUnique({ where: { id } });

        if (!service) {
            throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
        }

        const updatedService = await prisma.service.update({
            where: { id },
            data: { isActive: !service.isActive },
        });

        appEvents.emitDataChange(SystemEvents.SERVICE_UPDATED, { serviceId: updatedService.id });

        return updatedService;
    }

    async deleteService(id: string) {
        const service = await prisma.service.findUnique({
            where: { id },
            include: { Booking: { take: 1 } }
        });

        if (!service) {
            throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
        }

        if (service.Booking.length > 0) {
            // Check if it's already disabled
            if (!service.isActive) {
                return { message: "SERVICE_ALREADY_DISABLED_HAS_BOOKINGS", id: service.id, status: "ALREADY_DISABLED" };
            }

            await prisma.service.update({
                where: { id },
                data: { isActive: false },
            });

            appEvents.emitDataChange(SystemEvents.SERVICE_UPDATED, { serviceId: service.id });

            return { message: "SERVICE_DISABLED_INSTEAD_OF_DELETED", id: service.id, status: "DISABLED_ONLY" };
        }

        await prisma.service.delete({ where: { id } });

        appEvents.emitDataChange(SystemEvents.SERVICE_DELETED, { serviceId: service.id });

        return { message: "SERVICE_DELETED_SUCCESS" };
    }

    async deleteMultipleServices(ids: string[]) {
        const results = await prisma.service.deleteMany({
            where: {
                id: {
                    in: ids
                }
            }
        })

        return { deletedCount: results.count };
    }
}
