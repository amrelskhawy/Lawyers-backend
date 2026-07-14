/**
 * Shared helpers for files that will be delivered over WhatsApp (WAAPI).
 * WAAPI only accepts a fixed set of document/media types, so uploads are
 * restricted to the same set to guarantee an uploaded file is sendable.
 */

// WAAPI only accepts these file types for document/media messages.
export const ALLOWED_WA_EXTENSIONS = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "pdf",
    "docx",
    "xlsx",
    "csv",
    "txt",
];

export function fileExtension(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Multer decodes multipart filenames as latin1, so UTF-8 names (Arabic)
 * arrive mangled ("انذار.pdf" → "Ø§ÙØ°Ø§Ø±.pdf"). Re-decode as UTF-8;
 * keep the original if the result isn't valid UTF-8 (it was real latin1).
 */
export function fixFileNameEncoding(name: string): string {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("�") ? name : decoded;
}
