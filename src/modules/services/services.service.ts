import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
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
            throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
        }

        return service;
    }

    async createService(payload: any) {
        // Handle generic name/description for convenience, while respecting explicit _ar/_en fields
        const name_ar = payload.name_ar || payload.name || "";
        const name_en = payload.name_en || payload.name || "";
        const description_ar = payload.description_ar || payload.description;
        const description_en = payload.description_en || payload.description;
        const price = payload.price;

        const service = await prisma.service.create({
            data: {
                name_ar,
                name_en,
                description_ar,
                description_en,
                price: price !== undefined ? new Prisma.Decimal(price) : null,
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

            appEvents.emitDataChange(SystemEvents.SERVICE_UPDATED, { serviceId: updatedService.id });

            return updatedService;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
            }
            throw error;
        }
    }

    async deleteService(id: string) {
        const service = await prisma.service.findUnique({ where: { id } });

        if (!service) {
            throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);
        }

        await prisma.service.delete({ where: { id } });

        appEvents.emitDataChange(SystemEvents.SERVICE_DELETED, { serviceId: service.id });

        return { message: "Service deleted successfully" };
    }
}
