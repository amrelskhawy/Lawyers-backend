import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureSignaturesFolder } from "../../core/services/google/signatures-folder.js";
import { fixFileNameEncoding } from "../../core/utils/wa-file.js";

export interface SavedSignature {
    id: string;
    fileName: string;
    /** `data:<mime>;base64,...` — ready to use directly as an <img> src / pdf stamp. */
    dataUrl: string;
    createdAt: Date;
}

function toDataUrl(mimeType: string, buffer: Buffer): string {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export class SignatureService {
    /**
     * List all saved signatures (shared app-wide), each with its image inlined
     * as a data URL so the client can render/stamp it without a second request.
     * Rows whose Drive file has vanished are skipped rather than failing the
     * whole list.
     */
    async list(): Promise<SavedSignature[]> {
        const rows = await prisma.signature.findMany({
            orderBy: { createdAt: "desc" },
        });

        const results = await Promise.all(
            rows.map(async (row) => {
                try {
                    const buffer = await driveService.downloadFile(row.driveFileId);
                    return {
                        id: row.id,
                        fileName: row.fileName,
                        dataUrl: toDataUrl(row.mimeType, buffer),
                        createdAt: row.createdAt,
                    };
                } catch (err) {
                    console.error(`signature ${row.id} Drive download failed (skipping):`, err);
                    return null;
                }
            }),
        );

        return results.filter((s): s is SavedSignature => s !== null);
    }

    /** Upload a signature image to the shared Drive folder and record it. */
    async create(
        file: { originalname: string; buffer: Buffer; mimetype: string },
    ): Promise<SavedSignature> {
        if (!file.mimetype.startsWith("image/")) {
            throw new AppResponse(false, "SIGNATURE_INVALID_TYPE", null, 400);
        }

        const fileName = fixFileNameEncoding(file.originalname);
        const folderId = await ensureSignaturesFolder();
        const uploaded = await driveService.uploadBuffer(
            fileName,
            file.buffer,
            folderId,
            file.mimetype,
        );
        if (!uploaded.id) {
            throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);
        }

        const row = await prisma.signature.create({
            data: { fileName, mimeType: file.mimetype, driveFileId: uploaded.id },
        });

        return {
            id: row.id,
            fileName: row.fileName,
            dataUrl: toDataUrl(file.mimetype, file.buffer),
            createdAt: row.createdAt,
        };
    }

    /** Delete a saved signature from Drive and the database. */
    async remove(id: string): Promise<{ id: string }> {
        const row = await prisma.signature.findUnique({ where: { id } });
        if (!row) {
            throw new AppResponse(false, "SIGNATURE_NOT_FOUND", null, 404);
        }

        // Best-effort Drive cleanup — never block the row delete on it.
        await driveService.deleteFile(row.driveFileId).catch((err) => {
            console.error("Signature Drive delete failed (non-blocking):", err);
        });

        await prisma.signature.delete({ where: { id } });
        return { id };
    }
}
