import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateServicePayload, UpdateServicePayload } from "./services.validator.js";
import z from "zod";
import { appEvents, SystemEvents } from "../../core/utils/events.js";

export class ServiceService {
    async getAllServices() {
        const services = await prisma.service.findMany({
            orderBy: { createdAt: "desc" },
        });
        return services;
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
                return { message: "Service is already disabled and cannot be deleted because it has associated bookings", id: service.id, status: "ALREADY_DISABLED" };
            }

            await prisma.service.update({
                where: { id },
                data: { isActive: false },
            });

            appEvents.emitDataChange(SystemEvents.SERVICE_UPDATED, { serviceId: service.id });

            return { message: "Service has bookings, so it has been disabled instead of deleted", id: service.id, status: "DISABLED_ONLY" };
        }

        await prisma.service.delete({ where: { id } });

        appEvents.emitDataChange(SystemEvents.SERVICE_DELETED, { serviceId: service.id });

        return { message: "Service deleted successfully" };
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
