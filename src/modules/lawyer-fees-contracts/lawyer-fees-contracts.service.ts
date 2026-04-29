import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { renderLawyerFeesContractPdf } from "./lawyer-fees-pdf.service.js";
import type { UpdateLawyerFeesContractPayload } from "./lawyer-fees-contracts.validator.js";

const contractInclude = {
    customer: {
        select: { id: true, fullName: true, email: true, phone: true },
    },
    case: {
        select: { id: true, caseType: true, caseDate: true, agencyNumber: true, customerId: true },
    },
    createdBy: { select: { id: true, name: true } },
} satisfies Prisma.LawyerFeesContractInclude;

const SCALAR_KEYS = [
    "contractNumber",
    "contractDay",
    "hijriDate",
    "clientName",
    "clientIdNumber",
    "clientPhone",
    "serviceDescription",
    "currency",
    "firstPartySignature",
    "secondPartySignature",
] as const;

const DATE_KEYS = [
    "contractDate",
    "firstPartySignedAt",
    "secondPartySignedAt",
] as const;

const DECIMAL_KEYS = ["totalFees", "firstInstallment", "secondInstallment"] as const;

const RELATION_KEYS = ["customerId", "caseId"] as const;

export class LawyerFeesContractsService {
    async list() {
        return prisma.lawyerFeesContract.findMany({
            where: { isDeleted: false },
            include: contractInclude,
            orderBy: { createdAt: "desc" },
        });
    }

    async listByCase(caseId: string) {
        return prisma.lawyerFeesContract.findMany({
            where: { caseId, isDeleted: false },
            include: contractInclude,
            orderBy: { createdAt: "desc" },
        });
    }

    async listByCustomer(customerId: string) {
        return prisma.lawyerFeesContract.findMany({
            where: { customerId, isDeleted: false },
            include: contractInclude,
            orderBy: { createdAt: "desc" },
        });
    }

    async getById(id: string) {
        const r = await prisma.lawyerFeesContract.findUnique({
            where: { id },
            include: contractInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        return r;
    }

    async create(
        payload: { customerId?: string | null; caseId?: string | null },
        createdById: string,
    ) {
        if (payload.caseId) {
            const c = await prisma.case.findUnique({ where: { id: payload.caseId } });
            if (!c || c.isDeleted) {
                throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
            }
        }
        if (payload.customerId) {
            const cust = await prisma.customer.findUnique({ where: { id: payload.customerId } });
            if (!cust || cust.isDeleted) {
                throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
            }
        }

        return prisma.lawyerFeesContract.create({
            data: {
                customerId: payload.customerId ?? null,
                caseId:     payload.caseId ?? null,
                createdById,
            },
            include: contractInclude,
        });
    }

    async update(id: string, payload: UpdateLawyerFeesContractPayload) {
        const existing = await prisma.lawyerFeesContract.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }

        const data: Prisma.LawyerFeesContractUpdateInput = {};

        for (const key of SCALAR_KEYS) {
            if (payload[key] !== undefined) {
                (data as any)[key] = payload[key];
            }
        }

        for (const key of DATE_KEYS) {
            if (payload[key] !== undefined) {
                (data as any)[key] = payload[key] ? new Date(payload[key] as string) : null;
            }
        }

        for (const key of DECIMAL_KEYS) {
            if (payload[key] !== undefined) {
                const v = payload[key];
                (data as any)[key] = v === null || v === "" ? null : new Prisma.Decimal(v as any);
            }
        }

        for (const key of RELATION_KEYS) {
            if (payload[key] === undefined) continue;
            if (key === "customerId") {
                data.customer = payload.customerId
                    ? { connect: { id: payload.customerId } }
                    : { disconnect: true };
            } else {
                data.case = payload.caseId
                    ? { connect: { id: payload.caseId } }
                    : { disconnect: true };
            }
        }

        return prisma.lawyerFeesContract.update({
            where: { id },
            data,
            include: contractInclude,
        });
    }

    async remove(id: string) {
        const existing = await prisma.lawyerFeesContract.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        await prisma.lawyerFeesContract.update({ where: { id }, data: { isDeleted: true } });
        return { message: "LAWYER_FEES_CONTRACT_DELETED_SUCCESS" };
    }

    private async ensureCustomerFolder(customerId: string | null): Promise<string> {
        const rootFolderId = process.env.GOOGLE_DRIVE_CASE_REPORTS_FOLDER_ID;
        if (!rootFolderId) {
            throw new AppResponse(false, "CASE_REPORTS_FOLDER_NOT_CONFIGURED", null, 500);
        }
        if (!customerId) return rootFolderId;

        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) return rootFolderId;
        if (customer.caseReportsFolderId) return customer.caseReportsFolderId;

        const folder = await driveService.createFolder(
            `${customer.fullName} (${customer.id.slice(0, 8)})`,
            rootFolderId,
        );
        if (!folder.id) {
            throw new AppResponse(false, "DRIVE_FOLDER_CREATE_FAILED", null, 500);
        }
        await prisma.customer.update({
            where: { id: customerId },
            data: { caseReportsFolderId: folder.id },
        });
        return folder.id;
    }

    private isReportFresh(c: {
        reportFileId: string | null;
        reportGeneratedAt: Date | null;
        updatedAt: Date;
    }): boolean {
        return !!c.reportFileId && !!c.reportGeneratedAt && c.updatedAt <= c.reportGeneratedAt;
    }

    private async deleteOldReportFile(fileId: string | null) {
        if (!fileId) return;
        try { await driveService.deleteFile(fileId); } catch (err) {
            console.error("Old lawyer-fees Drive delete failed (non-blocking):", err);
        }
    }

    async generateAndUploadPdf(id: string) {
        const c = await prisma.lawyerFeesContract.findUnique({
            where: { id },
            include: contractInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }

        if (this.isReportFresh(c)) {
            return { data: c, regenerated: false };
        }

        await this.deleteOldReportFile(c.reportFileId);
        const folderId = await this.ensureCustomerFolder(c.customerId);
        const buffer = await renderLawyerFeesContractPdf(c);

        const fileName = `lawyer-fees-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const updated = await prisma.lawyerFeesContract.update({
            where: { id },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
                reportGeneratedAt: new Date(),
            },
            include: contractInclude,
        });
        return { data: updated, regenerated: true };
    }
}
