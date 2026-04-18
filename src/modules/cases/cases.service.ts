import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { sendWhatsAppFile } from "../../core/services/waapi/waapi.service.js";
import { renderCaseReportPdf } from "./case-pdf.service.js";
import type { CreateCasePayload, UpdateCasePayload } from "./cases.validator.js";

const caseInclude = {
    customer: {
        select: { id: true, fullName: true, email: true, phone: true, caseReportsFolderId: true },
    },
    preferredLawyer: { select: { id: true, name: true } },
    sessionReceiver: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CaseInclude;

export class CasesService {
    async list() {
        return prisma.case.findMany({
            where: { isDeleted: false },
            include: caseInclude,
            orderBy: { createdAt: "desc" },
        });
    }

    /**
     * List staff (admins + moderators) eligible to be picked as the preferred lawyer
     * or the session receiver. Returns minimal fields for a dropdown.
     */
    async listLawyers() {
        return prisma.user.findMany({
            where: { role: { in: ["ADMIN", "MODERATOR"] } },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
        });
    }

    async getById(id: string) {
        const c = await prisma.case.findUnique({
            where: { id },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        return c;
    }

    async create(payload: CreateCasePayload, createdById: string) {
        // Verify customer exists and is not deleted
        const customer = await prisma.customer.findUnique({
            where: { id: payload.customerId },
        });
        if (!customer || customer.isDeleted) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        return prisma.case.create({
            data: {
                customerId: payload.customerId,
                caseType: payload.caseType,
                otherCaseType: payload.caseType === "OTHER" ? payload.otherCaseType : null,
                caseDate: new Date(payload.caseDate),
                hijriDate: payload.hijriDate ?? null,
                agencyNumber: payload.agencyNumber ?? null,
                createdById,
            },
            include: caseInclude,
        });
    }
    // TODO: improve it to be senior Level
    async update(id: string, payload: UpdateCasePayload) {
        const existing = await prisma.case.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        const data: Prisma.CaseUpdateInput = {};
        if (payload.customerId !== undefined) {
            data.customer = { connect: { id: payload.customerId } };
        }
        if (payload.caseType !== undefined) data.caseType = payload.caseType;
        if (payload.otherCaseType !== undefined) data.otherCaseType = payload.otherCaseType;
        if (payload.caseDate !== undefined) data.caseDate = new Date(payload.caseDate);
        if (payload.hijriDate !== undefined) data.hijriDate = payload.hijriDate;
        if (payload.agencyNumber !== undefined) data.agencyNumber = payload.agencyNumber;
        if (payload.wantsSpecificLawyer !== undefined) {
            data.wantsSpecificLawyer = payload.wantsSpecificLawyer;
        }
        if (payload.preferredLawyerId !== undefined) {
            data.preferredLawyer = payload.preferredLawyerId
                ? { connect: { id: payload.preferredLawyerId } }
                : { disconnect: true };
        }
        if (payload.preferredLawyerName !== undefined) {
            data.preferredLawyerName = payload.preferredLawyerName;
        }
        if (payload.sessionReceiverId !== undefined) {
            data.sessionReceiver = payload.sessionReceiverId
                ? { connect: { id: payload.sessionReceiverId } }
                : { disconnect: true };
        }
        if (payload.sessionDate !== undefined) {
            data.sessionDate = payload.sessionDate ? new Date(payload.sessionDate) : null;
        }
        if (payload.hasStructuredNotes !== undefined) data.hasStructuredNotes = payload.hasStructuredNotes;
        if (payload.weaknesses !== undefined) data.weaknesses = payload.weaknesses;
        if (payload.strengths !== undefined) data.strengths = payload.strengths;
        if (payload.gaps !== undefined) data.gaps = payload.gaps;
        if (payload.freeNotes !== undefined) data.freeNotes = payload.freeNotes;

        return prisma.case.update({
            where: { id },
            data,
            include: caseInclude,
        });
    }

    async remove(id: string) {
        const existing = await prisma.case.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        await prisma.case.update({ where: { id }, data: { isDeleted: true } });
        return { message: "CASE_DELETED_SUCCESS" };
    }

    /**
     * Resolve (creating if necessary) the Drive folder for a customer's case reports.
     * Each customer gets a sub-folder under the configured root.
     */
    private async ensureCustomerFolder(customerId: string): Promise<string> {
        const rootFolderId = process.env.GOOGLE_DRIVE_CASE_REPORTS_FOLDER_ID;
        if (!rootFolderId) {
            throw new AppResponse(
                false,
                "CASE_REPORTS_FOLDER_NOT_CONFIGURED",
                null,
                500,
            );
        }

        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
            throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
        }

        if (customer.caseReportsFolderId) {
            return customer.caseReportsFolderId;
        }

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

    /**
     * A report is "fresh" when a Drive file already exists for it AND the case
     * hasn't been updated since that file was generated. In that case we can
     * skip the expensive render+upload and reuse the existing file.
     */
    private isReportFresh(c: { reportFileId: string | null; reportGeneratedAt: Date | null; updatedAt: Date }): boolean {
        return !!c.reportFileId && !!c.reportGeneratedAt && c.updatedAt <= c.reportGeneratedAt;
    }

    private async deleteOldReportFile(fileId: string | null) {
        if (!fileId) return;
        try {
            await driveService.deleteFile(fileId);
        } catch (err) {
            console.error("Old report Drive delete failed (non-blocking):", err);
        }
    }

    /**
     * Generate the case report PDF, upload it to the customer's Drive folder,
     * and persist the resulting file id + URL on the case row.
     *
     * If a report file already exists and the case hasn't changed since it
     * was generated, this is a no-op: we return the existing case row with
     * `regenerated: false` so the caller can tell the user nothing changed.
     *
     * Otherwise the stale Drive file (if any) is deleted before the new one
     * is uploaded, so we never accumulate orphaned duplicates.
     */
    async generateAndUploadPdf(caseId: string) {
        const c = await prisma.case.findUnique({
            where: { id: caseId },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        if (this.isReportFresh(c)) {
            return { data: c, regenerated: false };
        }

        await this.deleteOldReportFile(c.reportFileId);

        const folderId = await this.ensureCustomerFolder(c.customerId);
        const buffer = await renderCaseReportPdf(c);

        const fileName = `case-report-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);

        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const updated = await prisma.case.update({
            where: { id: caseId },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
                reportGeneratedAt: new Date(),
            },
            include: caseInclude,
        });
        return { data: updated, regenerated: true };
    }

    /**
     * Send the case report to the customer via WhatsApp (required) and email (optional).
     *
     * Mirrors the freshness logic of `generateAndUploadPdf`: if the case hasn't
     * changed since the last render we reuse the existing Drive file (downloading
     * the buffer for the email attachment) instead of regenerating. Otherwise
     * we delete the old file, render a new PDF, upload it, and send.
     */
    async sendToClient(caseId: string) {
        const c = await prisma.case.findUnique({
            where: { id: caseId },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (!c.customer?.phone) {
            throw new AppResponse(false, "CUSTOMER_PHONE_MISSING", null, 400);
        }

        let fileId: string;
        let webViewLink: string | null;
        let buffer: Buffer;
        let regenerated: boolean;

        if (this.isReportFresh(c)) {
            fileId = c.reportFileId!;
            webViewLink = c.reportUrl;
            buffer = await driveService.downloadFile(fileId);
            regenerated = false;
        } else {
            await this.deleteOldReportFile(c.reportFileId);

            const folderId = await this.ensureCustomerFolder(c.customerId);
            buffer = await renderCaseReportPdf(c);

            const fileName = `case-report-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
            const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
            if (!uploaded.id) {
                throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
            }
            fileId = uploaded.id;
            webViewLink = uploaded.webViewLink ?? null;
            regenerated = true;
        }

        const publicUrl = await driveService.makePublic(fileId);

        // WhatsApp is required — send the PDF via WhatsApp
        await sendWhatsAppFile(
            c.customer.phone,
            publicUrl,
            `تقرير القضية - شركة سعد البقمي\n${c.customer.fullName}`,
        );

        // Email is optional — send only if the customer has an email
        if (c.customer.email) {
            try {
                await sendEmailWithTemplate(
                    c.customer.email,
                    "تقرير القضية - شركة سعد البقمي",
                    "caseReport",
                    { customerName: c.customer.fullName },
                    [
                        {
                            filename: `case-report-${c.id.slice(0, 8)}.pdf`,
                            content: buffer,
                            contentType: "application/pdf",
                        },
                    ],
                );
            } catch (err) {
                console.error("Email send failed (non-blocking):", err);
            }
        }

        const updateData: Prisma.CaseUpdateInput = { sentToClientAt: new Date() };
        if (regenerated) {
            updateData.reportFileId = fileId;
            updateData.reportUrl = webViewLink;
            updateData.reportGeneratedAt = new Date();
        }

        const updated = await prisma.case.update({
            where: { id: caseId },
            data: updateData,
            include: caseInclude,
        });
        return { data: updated, regenerated };
    }
}
