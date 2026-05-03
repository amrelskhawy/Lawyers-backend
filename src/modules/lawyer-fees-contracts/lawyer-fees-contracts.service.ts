import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { sendWhatsAppMessage } from "../../core/services/waapi/waapi.service.js";
import { renderLawyerFeesContractPdf } from "./lawyer-fees-pdf.service.js";
import type { UpdateLawyerFeesContractPayload } from "./lawyer-fees-contracts.validator.js";

const SIGNING_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
    "otherFees",
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

        const contractNumber = await this.generateNextContractNumber();

        return prisma.lawyerFeesContract.create({
            data: {
                contractNumber,
                customerId: payload.customerId ?? null,
                caseId: payload.caseId ?? null,
                createdById,
            },
            include: contractInclude,
        });
    }

    private async generateNextContractNumber(): Promise<string> {
        const last = await prisma.lawyerFeesContract.findFirst({
            where: { contractNumber: { not: null } },
            orderBy: { createdAt: "desc" },
            select: { contractNumber: true },
        });
        if (!last) return "1000000";
        const n = parseInt((last.contractNumber ?? "").replace(/\D/g, ""), 10);
        return String((Number.isFinite(n) ? n : 1000000) + 1);
    }

    async update(id: string, payload: UpdateLawyerFeesContractPayload) {
        const existing = await prisma.lawyerFeesContract.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        if (existing.secondPartySignedAt) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_ALREADY_SIGNED", null, 409);
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

    private async regenerateAndUploadPdfForce(id: string) {
        // Drop fresh-check; always regenerate (used after signature submit)
        const c = await prisma.lawyerFeesContract.findUnique({
            where: { id },
            include: contractInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }

        await this.deleteOldReportFile(c.reportFileId);
        const folderId = await this.ensureCustomerFolder(c.customerId);
        const buffer = await renderLawyerFeesContractPdf(c);

        const fileName = `lawyer-fees-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const publicUrl = await driveService.makePublic(uploaded.id);

        return prisma.lawyerFeesContract.update({
            where: { id },
            data: {
                reportFileId: uploaded.id,
                reportUrl: publicUrl ?? uploaded.webViewLink ?? null,
                reportGeneratedAt: new Date(),
            },
            include: contractInclude,
        });
    }

    async createSigningLink(id: string) {
        const c = await prisma.lawyerFeesContract.findUnique({ where: { id } });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        if (!c.clientIdNumber) {
            throw new AppResponse(false, "CLIENT_ID_NUMBER_REQUIRED_FOR_SIGNING", null, 400);
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + SIGNING_TOKEN_TTL_MS);

        await prisma.lawyerFeesContract.update({
            where: { id },
            data: {
                signingToken: token,
                signingTokenExpiresAt: expiresAt,
                signingUsedAt: null,
            },
        });

        const url = this.buildSigningUrl(token);
        return { url, token, expiresAt };
    }

    private buildSigningUrl(token: string): string {
        const base = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
        return `${base}/sign-contract/${token}`;
    }

    /**
     * Reuse the contract's current token if still valid (not used, not expired);
     * otherwise issue a fresh one. Used by the "send via WhatsApp" action so
     * that clicking it after a recently-generated link doesn't invalidate the
     * URL the moderator just copied.
     */
    private async ensureValidSigningLink(id: string) {
        const c = await prisma.lawyerFeesContract.findUnique({ where: { id } });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        if (!c.clientIdNumber) {
            throw new AppResponse(false, "CLIENT_ID_NUMBER_REQUIRED_FOR_SIGNING", null, 400);
        }

        const stillValid =
            !!c.signingToken &&
            !c.signingUsedAt &&
            !!c.signingTokenExpiresAt &&
            c.signingTokenExpiresAt > new Date();

        if (stillValid) {
            return {
                url: this.buildSigningUrl(c.signingToken!),
                token: c.signingToken!,
                expiresAt: c.signingTokenExpiresAt!,
            };
        }
        return this.createSigningLink(id);
    }

    async sendSigningLinkOnWhatsapp(id: string) {
        const c = await prisma.lawyerFeesContract.findUnique({
            where: { id },
            include: contractInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        const phone = c.clientPhone || c.customer?.phone;
        if (!phone) {
            throw new AppResponse(false, "CUSTOMER_PHONE_MISSING", null, 400);
        }

        const link = await this.ensureValidSigningLink(id);

        const greeting = c.clientName ? `الأستاذ/ ${c.clientName}` : "حضرتكم الكريمة";
        const message =
            `السلام عليكم ورحمة الله وبركاته
${greeting}،

تهديكم شركة سعد البقمي للمحاماة والاستشارات القانونية أطيب التحايا.
نرجو منكم توقيع عقد أتعاب المحاماة عبر الرابط التالي خلال 30 دقيقة:

${link.url}

ولأي استفسار يسرنا تواصلكم معنا.`;

        await sendWhatsAppMessage(phone, message);
        return { url: link.url, expiresAt: link.expiresAt, sentTo: phone };
    }

    private async loadByValidToken(token: string) {
        const c = await prisma.lawyerFeesContract.findUnique({
            where: { signingToken: token },
            include: contractInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "SIGNING_TOKEN_INVALID", null, 404);
        }
        if (c.signingUsedAt) {
            throw new AppResponse(false, "SIGNING_TOKEN_ALREADY_USED", null, 410);
        }
        if (!c.signingTokenExpiresAt || c.signingTokenExpiresAt < new Date()) {
            throw new AppResponse(false, "SIGNING_TOKEN_EXPIRED", null, 410);
        }
        return c;
    }

    async verifyTokenAndIdentity(token: string, idNumber: string) {
        const c = await this.loadByValidToken(token);
        if (!c.clientIdNumber || c.clientIdNumber.trim() !== idNumber.trim()) {
            throw new AppResponse(false, "IDENTITY_MISMATCH", null, 401);
        }
        // Return enough fields to render the live 3-page visual preview on the signing page
        return {
            id: c.id,

            contractNumber: c.contractNumber,
            contractDay: c.contractDay,
            contractDate: c.contractDate,
            hijriDate: c.hijriDate,

            clientName: c.clientName,
            clientIdNumber: c.clientIdNumber,
            clientPhone: c.clientPhone,

            serviceDescription: c.serviceDescription,

            totalFees: c.totalFees,
            firstInstallment: c.firstInstallment,
            secondInstallment: c.secondInstallment,
            otherFees: c.otherFees,
            currency: c.currency,

            firstPartySignature: c.firstPartySignature,
            secondPartySignature: c.secondPartySignature,
            secondPartySignedAt: c.secondPartySignedAt,

            existingPdfUrl: c.reportUrl,
            firmName: "شركة سعد البقمي للمحاماة",
            expiresAt: c.signingTokenExpiresAt,
        };
    }

    async submitSignature(token: string, idNumber: string, signatureDataUrl: string) {
        const c = await this.loadByValidToken(token);
        if (!c.clientIdNumber || c.clientIdNumber.trim() !== idNumber.trim()) {
            throw new AppResponse(false, "IDENTITY_MISMATCH", null, 401);
        }
        if (!signatureDataUrl?.startsWith("data:image/")) {
            throw new AppResponse(false, "INVALID_SIGNATURE_PAYLOAD", null, 400);
        }

        const now = new Date();
        await prisma.lawyerFeesContract.update({
            where: { id: c.id },
            data: {
                secondPartySignature: signatureDataUrl,
                secondPartySignedAt: now,
                signingUsedAt: now,
            },
        });

        const updated = await this.regenerateAndUploadPdfForce(c.id);
        return {
            id: updated.id,
            reportUrl: updated.reportUrl,
            secondPartySignedAt: updated.secondPartySignedAt,
        };
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
