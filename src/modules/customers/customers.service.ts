import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { CreateCustomerPayload, UpdateCustomerPayload } from "./customers.validator.js";

export class CustomerService {
    async getAllCustomers() {
        const customers = await prisma.customer.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: "desc" },
        });
        return customers;
    }

    async getCustomerById(id: string) {
        const customer = await prisma.customer.findUnique({
            where: { id },
        });

        if (!customer || customer.isDeleted) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        return customer;
    }

    async createCustomer(payload: CreateCustomerPayload) {
        const customer = await prisma.customer.create({
            data: {
                fullName: payload.fullName,
                email: payload.email,
                phone: payload.phone,
                location: payload.location,
            },
        });

        return customer;
    }

    async updateCustomer(id: string, payload: UpdateCustomerPayload) {
        try {
            const existing = await prisma.customer.findUnique({ where: { id } });
            if (!existing || existing.isDeleted) {
                throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
            }

            const updatedCustomer = await prisma.customer.update({
                where: { id },
                data: payload,
            });

            return updatedCustomer;
        } catch (error) {
            if (error instanceof AppResponse) throw error;
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
            }
            throw error;
        }
    }

    async deleteCustomer(id: string) {
        const customer = await prisma.customer.findUnique({ where: { id } });

        if (!customer || customer.isDeleted) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        await prisma.customer.update({
            where: { id },
            data: { isDeleted: true },
        });

        return { message: "Customer deleted successfully" };
    }

    async deleteMultipleCustomers(ids: string[]) {
        const result = await prisma.customer.updateMany({
            where: {
                id: { in: ids },
                isDeleted: false,
            },
            data: { isDeleted: true },
        });

        return { deletedCount: result.count };
    }
}
