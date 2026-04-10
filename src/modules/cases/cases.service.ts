import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { renderCaseReportPdf } from "./case-pdf.service.js";
import { whapiService } from "../../core/services/whapi/whapi.service.js";
import type { CreateCasePayload, UpdateCasePayload } from "./cases.validator.js";

const caseInclude = {
    customer: {
        select: { id: true, fullName: true, email: true, phone: true },
    },
    preferredLawyer: { select: { id: true, name: true } },
    sessionReceiver: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CaseInclude;

export type WhatsappSendType = "REPORT" | "MESSAGE";
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
                caseDate: new Date(payload.caseDate),
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
        if (payload.caseDate !== undefined) data.caseDate = new Date(payload.caseDate);
        if (payload.wantsSpecificLawyer !== undefined) {
            data.wantsSpecificLawyer = payload.wantsSpecificLawyer;
        }
        if (payload.preferredLawyerId !== undefined) {
            data.preferredLawyer = payload.preferredLawyerId
                ? { connect: { id: payload.preferredLawyerId } }
                : { disconnect: true };
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
     * Generate the case report PDF, upload it to the customer's Drive folder,
     * and persist the resulting file id + URL on the case row.
     */
    async generateAndUploadPdf(caseId: string) {
        const c = await prisma.case.findUnique({
            where: { id: caseId },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }

        const folderId = await this.ensureCustomerFolder(c.customerId);
        const buffer = await renderCaseReportPdf(c);

        const fileName = `case-report-${c.id.slice(0, 8)}-${Date.now()}.pdf`;
        const uploaded = await driveService.uploadBuffer(fileName, buffer, folderId);

        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        return prisma.case.update({
            where: { id: caseId },
            data: {
                reportFileId: uploaded.id,
                reportUrl: uploaded.webViewLink ?? null,
            },
            include: caseInclude,
        });
    }

    /**
     * Send the case report to the customer by email as a PDF attachment.
     * Generates a fresh PDF on the fly so the email always reflects the latest data.
     */
    async sendToClient(caseId: string) {
        const c = await prisma.case.findUnique({
            where: { id: caseId },
            include: caseInclude,
        });
        if (!c || c.isDeleted) {
            throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        }
        if (!c.customer?.email) {
            throw new AppResponse(false, "CUSTOMER_EMAIL_MISSING", null, 400);
        }

        const buffer = await renderCaseReportPdf(c);

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

        return prisma.case.update({
            where: { id: caseId },
            data: { sentToClientAt: new Date() },
            include: caseInclude,
        });
    }

    async sendToWhatsapp(caseId: string, type: WhatsappSendType = "REPORT") {
        const c = await prisma.case.findUnique({ where: { id: caseId }, include: caseInclude });
        if (!c || c.isDeleted) throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
        if (!c.customer?.phone) throw new AppResponse(false, "CUSTOMER_PHONE_MISSING", null, 400);

        if (type === "REPORT") {
            const buffer = await renderCaseReportPdf(c);
            const base64 = buffer.toString("base64");
            await whapiService.sendDocument(c.customer.phone, {
                media: base64,
                filename: `case-report-${c.id.slice(0, 8)}.pdf`,
                caption: "تقرير القضية - شركة سعد البقمي للمحاماة والاستشارات القانونية",
            });
        } else {
            const body = `مرحباً ${c.customer.fullName}، تم تسجيل قضيتكم لدى شركة سعد البقمي للمحاماة والاستشارات القانونية. سيتواصل معكم فريقنا قريباً.`;
            await whapiService.sendText(c.customer.phone, body);
        }

        return prisma.case.update({
            where: { id: caseId },
            data: { sentToClientAt: new Date() },
            include: caseInclude,
        });
    }
}
