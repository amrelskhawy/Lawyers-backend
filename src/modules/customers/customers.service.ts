import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { buildMeta, parseListQuery, PageMeta } from "../../core/utils/pagination.js";
import { CreateCustomerPayload, UpdateCustomerPayload } from "./customers.validator.js";
import { sendWhatsAppFile } from "../../core/services/waapi/waapi.service.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureCustomerFolder } from "../../core/services/google/customer-folder.js";
import {
    ALLOWED_WA_EXTENSIONS,
    fileExtension,
    fixFileNameEncoding,
} from "../../core/utils/wa-file.js";

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


    /**
     * Send a document (e.g. a signed PDF from the document-signer) to the
     * customer over WhatsApp, then remove it once it's been delivered.
     *
     * WAAPI fetches the file from a public URL, so the bytes are uploaded to the
     * customer's Drive folder (public and reachable by WAAPI), handed to WAAPI,
     * and then deleted — the file only lives on Drive for the duration of the
     * send. On failure the upload is cleaned up too, so nothing is left behind.
     */
    async sendDocument(
        customerId: string,
        file: { originalname: string; buffer: Buffer; mimetype: string },
        caption?: string,
    ) {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true, fullName: true, phone: true, isDeleted: true },
        });
        if (!customer || customer.isDeleted) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }
        if (!customer.phone?.trim()) {
            throw new AppResponse(false, "CUSTOMER_NO_PHONE", null, 400);
        }

        const fileName = fixFileNameEncoding(file.originalname);
        if (!ALLOWED_WA_EXTENSIONS.includes(fileExtension(fileName))) {
            throw new AppResponse(
                false,
                "DOCUMENT_UNSUPPORTED_TYPE",
                { allowed: ALLOWED_WA_EXTENSIONS },
                400,
            );
        }

        const folderId = await ensureCustomerFolder(customer.id);
        const uploaded = await driveService.uploadBuffer(
            fileName,
            file.buffer,
            folderId,
            file.mimetype,
        );
        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }
        const driveFileId = uploaded.id;
        const messageText = caption?.trim() || fileName;

        try {
            // The `&filename=` suffix lets WAAPI detect the file type from the URL,
            // matching the pattern used for the (working) report/attachment sends.
            let publicUrl = await driveService.makePublic(driveFileId);
            publicUrl += `&filename=${encodeURIComponent(fileName)}`;
            await sendWhatsAppFile(customer.phone, publicUrl, messageText);
        } catch (e: any) {
            // Send failed — remove the upload so nothing is left behind.
            await driveService.deleteFile(driveFileId).catch((err) => {
                console.error("wa-doc Drive cleanup after send failure failed:", err);
            });
            throw new AppResponse(
                false,
                "DOCUMENT_SEND_FAILED",
                { reason: e?.message ?? "send failed" },
                400,
            );
        }

        // Delivered — remove the temporary Drive copy. Best-effort: WAAPI has
        // already fetched the file by the time the send resolves, so a failed
        // delete never fails the request.
        await driveService.deleteFile(driveFileId).catch((err) => {
            console.error("wa-doc Drive cleanup after send failed:", err);
        });

        return { customerId: customer.id, phone: customer.phone };
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
