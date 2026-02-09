import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";

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

    async createService(payload: any) {
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

    async updateService(id: string, payload: any) {
        const { name, description, price } = payload;

        const serviceExists = await prisma.service.findUnique({ where: { id } });
        if (!serviceExists) {
            throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
        }

        const service = await prisma.service.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(price !== undefined && { price }),
            },
        });

        return service;
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
