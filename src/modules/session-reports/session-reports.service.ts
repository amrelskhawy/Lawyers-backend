import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureCustomerFolder } from "../../core/services/google/customer-folder.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { sendWhatsAppFile } from "../../core/services/waapi/waapi.service.js";
import { renderSessionReportPdf } from "./session-report-pdf.service.js";
import { parseListQuery, buildMeta, type PageMeta } from "../../core/utils/pagination.js";
import type { UpdateSessionReportPayload } from "./session-reports.validator.js";

const sessionReportInclude = {
    case: {
        include: {
            customer: {
                select: { id: true, fullName: true, email: true, phone: true },
            },
            preferredLawyer: { select: { id: true, name: true } },
        },
    },
    createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SessionReportInclude;

export class SessionReportsService {
    async listByCase(caseId: string, query: Record<string, unknown> = {}) {
        const paginated = query.page !== undefined || query.limit !== undefined;

        const where: Prisma.SessionReportWhereInput = { caseId, isDeleted: false };

        if (!paginated) {
            const data = await prisma.sessionReport.findMany({
                where,
                include: sessionReportInclude,
                orderBy: { createdAt: "desc" },
            });
            return { data, meta: null as PageMeta | null };
        }

        const q = parseListQuery(query);
        if (q.search) {
            where.OR = [
                { sessionTitle: { contains: q.search, mode: "insensitive" } },
                { sessionSummary: { contains: q.search, mode: "insensitive" } },
                { courtDecision: { contains: q.search, mode: "insensitive" } },
                { lawyerNotes: { contains: q.search, mode: "insensitive" } },
                { reportNumber: { contains: q.search, mode: "insensitive" } },
                { caseNumber: { contains: q.search, mode: "insensitive" } },
            ];
        }

        const [total, data] = await Promise.all([
            prisma.sessionReport.count({ where }),
            prisma.sessionReport.findMany({
                where,
                include: sessionReportInclude,
                orderBy: { createdAt: "desc" },
                skip: q.skip,
                take: q.take,
            }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
    }

    async getById(id: string) {
        const r = await prisma.sessionReport.findUnique({
            where: { id },
            include: sessionReportInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "SESSION_REPORT_NOT_FOUND", null, 404);
        }
        return r;
    }

    /**
     * Create a new draft session report for a case.
     * The draft starts empty — all session-specific fields are filled via PATCH.
     * Case-derived fields are resolved at render time via the `case` relation.
     */
    async create(caseId: string, createdById: string) {
        const c = await prisma.case.findUnique({ where: { id: caseId } });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        return prisma.sessionReport.create({
            data: {
                caseId,
                createdById,
            },
            include: sessionReportInclude,
        });
    }

    async update(id: string, payload: UpdateSessionReportPayload) {
        const existing = await prisma.sessionReport.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "SESSION_REPORT_NOT_FOUND", null, 404);
        }

        const data: Prisma.SessionReportUpdateInput = {};
        if (payload.sessionDate !== undefined) {
            data.sessionDate = payload.sessionDate ? new Date(payload.sessionDate) : null;
        }
        if (payload.nextSessionDate !== undefined) {
            data.nextSessionDate = payload.nextSessionDate
                ? new Date(payload.nextSessionDate)
                : null;
        }
        for (const key of [
            "sessionTitle",
            "sessionSummary",
            "courtDecision",
            "lawyerNotes",
            "reportNumber",
            "courtName",
            "courtCircuit",
            "caseCharge",
            "opponentName",
            "caseNumber",
            "caseData",
            "sessionOrdinal",
            "attendanceOrdinal",
            "sessionTime",
            "hijriDate",
            "closingNote",
        ] as const) {
            if (payload[key] !== undefined) {
                (data as any)[key] = payload[key];
            }
        }

        // Court + case number live canonically on the Case (single source of
        // truth for reminders + PDFs). When they're edited here, mirror any
        // non-empty value up to the Case so both editors stay in sync. Blank
        // values are ignored so a stray empty save can't wipe the case's copy.
        const caseData: Prisma.CaseUpdateInput = {};
        if (typeof payload.courtName === "string" && payload.courtName.trim()) {
            caseData.courtName = payload.courtName.trim();
        }
        if (typeof payload.caseNumber === "string" && payload.caseNumber.trim()) {
            caseData.caseNumber = payload.caseNumber.trim();
        }
        if (Object.keys(caseData).length > 0) {
            await prisma.case.update({ where: { id: existing.caseId }, data: caseData });
        }

        return prisma.sessionReport.update({
            where: { id },
            data,
            include: sessionReportInclude,
        });
    }

    async remove(id: string) {
        const existing = await prisma.sessionReport.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            throw new AppResponse(false, "SESSION_REPORT_NOT_FOUND", null, 404);
        }
        await prisma.sessionReport.update({
            where: { id },
            data: { isDeleted: true },
        });
        return { message: "SESSION_REPORT_DELETED_SUCCESS" };
    }

    private ensureCustomerFolder(customerId: string): Promise<string> {
        return ensureCustomerFolder(customerId);
    }

    /**
     * A report is "fresh" when a Drive file already exists for it AND the
     * session report hasn't been updated since that file was generated. In
     * that case we can skip the render+upload and reuse the existing file.
     */
    private isReportFresh(r: { reportFileId: string | null; reportGeneratedAt: Date | null; updatedAt: Date }): boolean {
        return !!r.reportFileId && !!r.reportGeneratedAt && r.updatedAt <= r.reportGeneratedAt;
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
     * Generate the session-report PDF and upload it to the customer's Drive folder.
     *
     * Freshness shortcut: if a Drive file already exists and nothing has
     * changed since it was generated, return the existing row untouched with
     * `regenerated: false`. Otherwise delete the stale file first so Drive
     * doesn't accumulate duplicates.
     */
    async generateAndUploadPdf(id: string) {
        const r = await prisma.sessionReport.findUnique({
            where: { id },
            include: sessionReportInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "SESSION_REPORT_NOT_FOUND", null, 404);
        }
        if (!r.case) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        if (this.isReportFresh(r)) {
            return { data: r, regenerated: false };
        }

        await this.deleteOldReportFile(r.reportFileId);

        const folderId = await this.ensureCustomerFolder(r.case.customerId);
        const buffer = await renderSessionReportPdf(r);

        const fileName = `session-report-${r.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);

        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const updated = await prisma.sessionReport.update({
            where: { id },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
                reportGeneratedAt: new Date(),
            },
            include: sessionReportInclude,
        });
        return { data: updated, regenerated: true };
    }

    async sendToClient(id: string) {
        const r = await prisma.sessionReport.findUnique({
            where: { id },
            include: sessionReportInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "SESSION_REPORT_NOT_FOUND", null, 404);
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
            fileName = `session-report-${r.id.slice(0, 8)}.pdf`;
            regenerated = false;
        } else {
            await this.deleteOldReportFile(r.reportFileId);

            const folderId = await this.ensureCustomerFolder(r.case.customerId);
            buffer = await renderSessionReportPdf(r);

            fileName = `session-report-${r.id.slice(0, 8)}-${Date.now()}.pdf`;
            const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);
            if (!uploaded.id) {
                throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
            }
            fileId = uploaded.id;
            webViewLink = uploaded.webViewLink ?? null;
            regenerated = true;
        }

        let publicUrl = await driveService.makePublic(fileId);
        // Append filename so WAAPI can detect the file type from the URL
        publicUrl += `&filename=${fileName}`;

        const introText = ` السلام عليكم ورحمة الله وبركاته...\n
تهديكم شركة سعد البقمي للمحاماة والاستشارات القانونية أطيب التحايا......\n
ونفيدكم بأنه تم إرفاق تقرير حضور الجلسة ... نرجو منكم الاطلاع عليه ... وتقبلو تحياتنا…`;

        // WhatsApp is required — send the PDF via WhatsApp
        await sendWhatsAppFile(
            r.case.customer.phone,
            publicUrl,
            introText,
        );

        // Email is optional — send only if the customer has an email
        if (r.case.customer.email) {
            try {
                await sendEmailWithTemplate(
                    r.case.customer.email,
                    "تقرير الجلسة - شركة سعد البقمي",
                    "sessionReport",
                    { customerName: r.case.customer.fullName },
                    [
                        {
                            filename: `session-report-${r.id.slice(0, 8)}.pdf`,
                            content: buffer,
                            contentType: "application/pdf",
                        },
                    ],
                );
            } catch (err) {
                console.error("Email send failed (non-blocking):", err);
            }
        }

        const updateData: Prisma.SessionReportUpdateInput = { sentToClientAt: new Date() };
        if (regenerated) {
            updateData.reportFileId = fileId;
            updateData.reportUrl = webViewLink;
            updateData.reportGeneratedAt = new Date();
        }

        const updated = await prisma.sessionReport.update({
            where: { id },
            data: updateData,
            include: sessionReportInclude,
        });
        return { data: updated, regenerated };
    }
}
