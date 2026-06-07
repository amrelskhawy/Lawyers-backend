import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureCustomerFolder } from "../../core/services/google/customer-folder.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { sendWhatsAppFile } from "../../core/services/waapi/waapi.service.js";
import { renderFieldVisitReportPdf } from "./field-visit-pdf.service.js";
import type { UpdateFieldVisitReportPayload } from "./field-visit-reports.validator.js";

const fieldVisitInclude = {
    case: {
        include: {
            customer: {
                select: { id: true, fullName: true, email: true, phone: true },
            },
        },
    },
    createdBy: { select: { id: true, name: true } },
} satisfies Prisma.FieldVisitReportInclude;

export class FieldVisitReportsService {
    async listByCase(caseId: string) {
        return prisma.fieldVisitReport.findMany({
            where: { caseId, isDeleted: false },
            include: fieldVisitInclude,
            orderBy: { createdAt: "desc" },
        });
    }

    async getById(id: string) {
        const r = await prisma.fieldVisitReport.findUnique({
            where: { id },
            include: fieldVisitInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "FIELD_VISIT_REPORT_NOT_FOUND", null, 404);
        }
        return r;
    }

    async create(caseId: string, createdById: string) {
        const c = await prisma.case.findUnique({ where: { id: caseId } });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        return prisma.fieldVisitReport.create({
            data: { caseId, createdById },
            include: fieldVisitInclude,
        });
    }

    async update(id: string, payload: UpdateFieldVisitReportPayload) {
        const existing = await prisma.fieldVisitReport.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "FIELD_VISIT_REPORT_NOT_FOUND", null, 404);
        }

        const data: Prisma.FieldVisitReportUpdateInput = {};
        if (payload.reviewDate !== undefined) {
            data.reviewDate = payload.reviewDate ? new Date(payload.reviewDate) : null;
        }
        for (const key of [
            "reviewLawyer",
            "reviewPlace",
            "agencyNumber",
            "clientName",
            "caseNumber",
            "reportSummary",
        ] as const) {
            if (payload[key] !== undefined) {
                (data as any)[key] = payload[key];
            }
        }

        return prisma.fieldVisitReport.update({
            where: { id },
            data,
            include: fieldVisitInclude,
        });
    }

    async remove(id: string) {
        const existing = await prisma.fieldVisitReport.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "FIELD_VISIT_REPORT_NOT_FOUND", null, 404);
        }
        await prisma.fieldVisitReport.update({ where: { id }, data: { isDeleted: true } });
        return { message: "FIELD_VISIT_REPORT_DELETED_SUCCESS" };
    }

    private ensureCustomerFolder(customerId: string): Promise<string> {
        return ensureCustomerFolder(customerId);
    }

    private isReportFresh(r: {
        reportFileId: string | null;
        reportGeneratedAt: Date | null;
        updatedAt: Date;
    }): boolean {
        return !!r.reportFileId && !!r.reportGeneratedAt && r.updatedAt <= r.reportGeneratedAt;
    }

    private async deleteOldReportFile(fileId: string | null) {
        if (!fileId) return;
        try { await driveService.deleteFile(fileId); } catch (err) {
            console.error("Old field-visit Drive delete failed (non-blocking):", err);
        }
    }

    async generateAndUploadPdf(id: string) {
        const r = await prisma.fieldVisitReport.findUnique({
            where: { id },
            include: fieldVisitInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "FIELD_VISIT_REPORT_NOT_FOUND", null, 404);
        }
        if (!r.case) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        if (this.isReportFresh(r)) {
            return { data: r, regenerated: false };
        }

        await this.deleteOldReportFile(r.reportFileId);
        const folderId = await this.ensureCustomerFolder(r.case.customerId);
        const buffer = await renderFieldVisitReportPdf(r);

        const fileName = `field-visit-${r.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const updated = await prisma.fieldVisitReport.update({
            where: { id },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
                reportGeneratedAt: new Date(),
            },
            include: fieldVisitInclude,
        });
        return { data: updated, regenerated: true };
    }

    async sendToClient(id: string) {
        const r = await prisma.fieldVisitReport.findUnique({
            where: { id },
            include: fieldVisitInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "FIELD_VISIT_REPORT_NOT_FOUND", null, 404);
        }
        if (!r.case?.customer?.phone) {
            throw new AppResponse(false, "CUSTOMER_PHONE_MISSING", null, 400);
        }

        let fileId: string;
        let webViewLink: string | null;
        let buffer: Buffer;
        let fileName: string;
        let regenerated: boolean;

        if (this.isReportFresh(r)) {
            fileId = r.reportFileId!;
            webViewLink = r.reportUrl;
            buffer = await driveService.downloadFile(fileId);
            fileName = `field-visit-${r.id.slice(0, 8)}.pdf`;
            regenerated = false;
        } else {
            await this.deleteOldReportFile(r.reportFileId);
            const folderId = await this.ensureCustomerFolder(r.case.customerId);
            buffer = await renderFieldVisitReportPdf(r);
            fileName = `field-visit-${r.id.slice(0, 8)}-${Date.now()}.pdf`;
            const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
            if (!uploaded.id) {
                throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
            }
            fileId = uploaded.id;
            webViewLink = uploaded.webViewLink ?? null;
            regenerated = true;
        }

        let publicUrl = await driveService.makePublic(fileId);
        publicUrl += `&filename=${fileName}`;

        const introText = ` السلام عليكم ورحمة الله وبركاته...\n
تهديكم شركة سعد البقمي للمحاماة والاستشارات القانونية أطيب التحايا......\n
ونفيدكم بأنه تم إرفاق تقرير الزيارة الميدانية ... نرجو منكم الاطلاع عليه ... وتقبلو تحياتنا…`;

        await sendWhatsAppFile(r.case.customer.phone, publicUrl, introText);

        if (r.case.customer.email) {
            try {
                await sendEmailWithTemplate(
                    r.case.customer.email,
                    "تقرير الزيارة الميدانية - شركة سعد البقمي",
                    "sessionReport",
                    { customerName: r.case.customer.fullName },
                    [
                        {
                            filename: `field-visit-${r.id.slice(0, 8)}.pdf`,
                            content: buffer,
                            contentType: "application/pdf",
                        },
                    ],
                );
            } catch (err) {
                console.error("Email send failed (non-blocking):", err);
            }
        }

        const updateData: Prisma.FieldVisitReportUpdateInput = { sentToClientAt: new Date() };
        if (regenerated) {
            updateData.reportFileId = fileId;
            updateData.reportUrl = webViewLink;
            updateData.reportGeneratedAt = new Date();
        }

        const updated = await prisma.fieldVisitReport.update({
            where: { id },
            data: updateData,
            include: fieldVisitInclude,
        });
        return { data: updated, regenerated };
    }
}
