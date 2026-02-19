import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateServiceSchema, UpdateServiceSchema } from "./services.types.js";
import z from "zod";

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

        return service;
    }


    async updateService(id: string, payload: z.infer<typeof UpdateServiceSchema>) {
        try {
            return await prisma.service.update({
                where: { id },
                data: payload, // prisma by default ignores undefined fields
            });
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
        return { message: "Service deleted successfully" };
    }
}
