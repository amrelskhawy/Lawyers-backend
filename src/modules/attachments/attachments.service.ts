import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureCustomerFolder } from "../../core/services/google/customer-folder.js";
import { sendWhatsAppFile } from "../../core/services/waapi/waapi.service.js";
import type { Role } from "@prisma/client";

type Actor = { id: string; role: Role };

const STAFF: Role[] = ["ADMIN", "MODERATOR"];

// WhatsApp (WAAPI) only accepts these file types for document/media messages.
// We restrict uploads to the same set so an attachment is always sendable.
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf", "docx", "xlsx", "csv", "txt"];

function fileExtension(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Multer decodes multipart filenames as latin1, so UTF-8 names (Arabic)
 * arrive mangled ("انذار.pdf" → "Ø§ÙØ°Ø§Ø±.pdf"). Re-decode as UTF-8;
 * keep the original if the result isn't valid UTF-8 (it was real latin1).
 */
function fixFileNameEncoding(name: string): string {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("�") ? name : decoded;
}

/**
 * Throw 404/403 unless the case exists and the actor may manage its files.
 * Mirrors the reminders access rule: staff always, lawyers only on their cases.
 */
async function assertCaseAccess(caseId: string, user: Actor) {
    const c = await prisma.case.findUnique({
        where: { id: caseId },
        select: {
            id: true,
            customerId: true,
            preferredLawyerId: true,
            sessionReceiverId: true,
            isDeleted: true,
            customer: { select: { fullName: true, phone: true } },
        },
    });
    if (!c || c.isDeleted) throw new AppResponse(false, "CASE_NOT_FOUND", null, 404);
    const isCaseHandler = user.role === "LAWYER" || user.role === "CONSULTANT";
    if (isCaseHandler && c.preferredLawyerId !== user.id && c.sessionReceiverId !== user.id) {
        throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
    }
    if (!STAFF.includes(user.role) && !isCaseHandler) {
        throw new AppResponse(false, "AUTH_UNAUTHORIZED", null, 403);
    }
    return c;
}

export class AttachmentService {
    async listByCase(caseId: string, user: Actor) {
        await assertCaseAccess(caseId, user);
        return prisma.caseAttachment.findMany({
            where: { caseId },
            orderBy: { createdAt: "desc" },
        });
    }

    /** Upload a device file into the customer's Drive folder and record it. */
    async upload(
        caseId: string,
        file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
        user: Actor,
    ) {
        const c = await assertCaseAccess(caseId, user);

        const fileName = fixFileNameEncoding(file.originalname);
        if (!ALLOWED_EXTENSIONS.includes(fileExtension(fileName))) {
            throw new AppResponse(
                false,
                "ATTACHMENT_UNSUPPORTED_TYPE",
                { allowed: ALLOWED_EXTENSIONS },
                400,
            );
        }

        const folderId = await ensureCustomerFolder(c.customerId);
        const uploaded = await driveService.uploadBuffer(
            fileName,
            file.buffer,
            folderId,
            file.mimetype,
        );
        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }
        const url = await driveService.makePublic(uploaded.id);

        return prisma.caseAttachment.create({
            data: {
                caseId,
                fileName,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                driveFileId: uploaded.id,
                url: url ?? uploaded.webViewLink ?? "",
                uploadedById: user.id,
            },
        });
    }

    /**
     * Send the attachment to the client (customer) via WhatsApp.
     * An optional `message` is sent as the file caption; when omitted we fall
     * back to the file name so the message is never empty.
     */
    async send(id: string, user: Actor, message?: string) {
        const att = await prisma.caseAttachment.findUnique({ where: { id } });
        if (!att) throw new AppResponse(false, "ATTACHMENT_NOT_FOUND", null, 404);
        const c = await assertCaseAccess(att.caseId, user);

        const phone = c.customer?.phone;
        if (!phone) {
            throw new AppResponse(false, "ATTACHMENT_NO_RECIPIENT", null, 400);
        }

        const caption = message?.trim() || att.fileName;

        try {
            // Same pattern as the working report sends: hand WAAPI the public
            // Drive URL with a `&filename=` suffix so it can detect the file type.
            // Encode the filename — user uploads have spaces/Arabic that
            // would otherwise produce a URL WAAPI cannot fetch.
            let publicUrl = await driveService.makePublic(att.driveFileId);
            publicUrl += `&filename=${encodeURIComponent(att.fileName)}`;
            await sendWhatsAppFile(phone, publicUrl, caption);
        } catch (e: any) {
            // WAAPI rejects unsupported/unreachable files — surface a clean 400
            // instead of a generic 500 so the client can show a useful message.
            throw new AppResponse(
                false,
                "ATTACHMENT_SEND_FAILED",
                { reason: e?.message ?? "send failed" },
                400,
            );
        }

        return prisma.caseAttachment.update({
            where: { id },
            data: { sentAt: new Date() },
        });
    }

    async remove(id: string, user: Actor) {
        const att = await prisma.caseAttachment.findUnique({ where: { id } });
        if (!att) throw new AppResponse(false, "ATTACHMENT_NOT_FOUND", null, 404);
        await assertCaseAccess(att.caseId, user);

        // Best-effort Drive cleanup — never block the row delete on it.
        try {
            await driveService.deleteFile(att.driveFileId);
        } catch (err) {
            console.error("Attachment Drive delete failed (non-blocking):", err);
        }

        await prisma.caseAttachment.delete({ where: { id } });
        return { id };
    }
}
