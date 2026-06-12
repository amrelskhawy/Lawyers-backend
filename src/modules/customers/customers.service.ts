import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { buildMeta, parseListQuery, PageMeta } from "../../core/utils/pagination.js";
import { CreateCustomerPayload, UpdateCustomerPayload } from "./customers.validator.js";

export class CustomerService {
    async getAllCustomers() {
        const customers = await prisma.customer.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: "desc" },
        });
        return customers;
    }

    /**
     * Opt-in paginated list of customers.
     *
     * Only paginates when the request query carries `page` or `limit`.
     * Otherwise returns the full array (meta: null), preserving the previous
     * behaviour for stats/other callers that fetch all records.
     */
    async listCustomers(
        query: Record<string, unknown>,
    ): Promise<{ data: Awaited<ReturnType<CustomerService["getAllCustomers"]>>; meta: PageMeta | null }> {
        const q = parseListQuery(query);

        const search = q.search
            ? [
                  {
                      OR: [
                          { fullName: { contains: q.search, mode: "insensitive" as const } },
                          { email: { contains: q.search, mode: "insensitive" as const } },
                          { phone: { contains: q.search, mode: "insensitive" as const } },
                          { location: { contains: q.search, mode: "insensitive" as const } },
                      ],
                  },
              ]
            : [];

        const where: Prisma.CustomerWhereInput = {
            AND: [{ isDeleted: false }, ...search],
        };

        const orderBy = q.sortBy
            ? { [q.sortBy]: q.sortOrder }
            : { createdAt: "desc" as const };

        const isPaginated = query.page !== undefined || query.limit !== undefined;

        if (!isPaginated) {
            const data = await prisma.customer.findMany({ where, orderBy });
            return { data, meta: null };
        }

        const [total, data] = await Promise.all([
            prisma.customer.count({ where }),
            prisma.customer.findMany({ where, orderBy, skip: q.skip, take: q.take }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
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


    /**
     * Find existing customer by email, or create a new one.
     * Called from public (non-auth) booking flow — never updates existing records.
     */
    async findOrCreateCustomerFromBooking(data: {
        fullName: string;
        email: string;
        phone: string;
    }): Promise<string> {
        const existing = await prisma.customer.findFirst({
            where: { email: data.email },
        });

        if (existing) {
            return existing.id;
        }

        const customer = await prisma.customer.create({
            data: {
                fullName: data.fullName,
                email: data.email,
                phone: data.phone,
            },
        });

        return customer.id;
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

        return { message: "CUSTOMER_DELETED_SUCCESS" };
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
