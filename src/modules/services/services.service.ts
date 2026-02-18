import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { CreateServiceSchema, UpdateServiceSchema } from "./services.types.js";
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
            throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
        }

        return service;
    }

    async createService(payload: z.infer<typeof CreateServiceSchema>) {
        const { name_ar, name_en, description_ar, description_en, price } = payload;

        const service = await prisma.service.create({
            data: {
                name_ar,
                name_en,
                description_ar,
                description_en,
                price,
            },
        });

        appEvents.emitDataChange(SystemEvents.SERVICE_CREATED, { serviceId: service.id });

        return service;
    }


    async updateService(id: string, payload: z.infer<typeof UpdateServiceSchema>) {
        try {
            const updatedService = await prisma.service.update({
                where: { id },
                data: payload, // prisma by default ignores undefined fields
            });

            appEvents.emitDataChange(SystemEvents.SERVICE_UPDATED, { serviceId: service.id });

            return updatedService;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
            }
            throw error;
        }
    }

    async deleteService(id: string) {
        const service = await prisma.service.findUnique({ where: { id } });

        if (!service) {
            throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
        }

        await prisma.service.delete({ where: { id } });

        appEvents.emitDataChange(SystemEvents.SERVICE_DELETED, { serviceId: service.id });

        return { message: "Service deleted successfully" };
    }
}
