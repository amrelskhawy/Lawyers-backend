import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { renderSessionReportPdf } from "./session-report-pdf.service.js";
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
    async listByCase(caseId: string) {
        return prisma.sessionReport.findMany({
            where: { caseId, isDeleted: false },
            include: sessionReportInclude,
            orderBy: { createdAt: "desc" },
        });
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

    /**
     * Resolve (creating if necessary) the Drive folder for a customer's case reports.
     * Session reports are stored under the same per-customer folder as case reports.
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

        const folderId = await this.ensureCustomerFolder(r.case.customerId);
        const buffer = await renderSessionReportPdf(r);

        const fileName = `session-report-${r.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);

        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        return prisma.sessionReport.update({
            where: { id },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
            },
            include: sessionReportInclude,
        });
    }

    async sendToClient(id: string) {
        const r = await prisma.sessionReport.findUnique({
            where: { id },
            include: sessionReportInclude,
        });
        if (!r || r.isDeleted) {
            throw new AppResponse(false, "SESSION_REPORT_NOT_FOUND", null, 404);
        }
        if (!r.case?.customer?.email) {
            throw new AppResponse(false, "CUSTOMER_EMAIL_MISSING", null, 400);
        }

        const buffer = await renderSessionReportPdf(r);

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

        return prisma.sessionReport.update({
            where: { id },
            data: { sentToClientAt: new Date() },
            include: sessionReportInclude,
        });
    }
}
