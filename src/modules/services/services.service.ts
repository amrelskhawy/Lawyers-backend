import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { ServiceUpdateInput } from "./services.types.js";

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

    async createService(payload: ServiceUpdateInput) {
        const { name, description, price } = payload;

        const service = await prisma.service.create({
            data: {
                name,
                description,
                price,
            },
        });

        return service;
    }


    async updateService(id: string, payload: ServiceUpdateInput) {
        try {
            return await prisma.service.update({
                where: { id },
                data: payload, // prisma by default ignores undefined fields
            });
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
        return { message: "Service deleted successfully" };
    }
}
