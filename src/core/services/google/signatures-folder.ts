import { driveService } from "./drive.js";
import { AppResponse } from "../../utils/AppResponse.js";

const FOLDER_NAME = "signatures";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Resolved once per process — the shared "signatures" folder id. */
let cachedFolderId: string | null = null;

/**
 * Resolve (creating once) the single shared Drive folder that holds reusable
 * signature images. Prefers an explicit GOOGLE_DRIVE_SIGNATURES_FOLDER_ID;
 * otherwise finds-or-creates a "signatures" folder under the case-reports root
 * and caches its id so the folder is created at most once.
 */
export async function ensureSignaturesFolder(): Promise<string> {
    const configured = process.env.GOOGLE_DRIVE_SIGNATURES_FOLDER_ID;
    if (configured) return configured;

    if (cachedFolderId) return cachedFolderId;

    const rootFolderId = process.env.GOOGLE_DRIVE_CASE_REPORTS_FOLDER_ID;
    if (!rootFolderId) {
        throw new AppResponse(false, "SIGNATURES_FOLDER_NOT_CONFIGURED", null, 500);
    }

    // Reuse the folder if a previous run already created it.
    const children = (await driveService.listFilesByFolder(rootFolderId)) ?? [];
    const existing = children.find((f) => f.name === FOLDER_NAME && f.mimeType === FOLDER_MIME);
    if (existing?.id) {
        cachedFolderId = existing.id;
        return existing.id;
    }

    const folder = await driveService.createFolder(FOLDER_NAME, rootFolderId);
    if (!folder.id) {
        throw new AppResponse(false, "DRIVE_FOLDER_CREATE_FAILED", null, 500);
    }
    cachedFolderId = folder.id;
    return folder.id;
}
