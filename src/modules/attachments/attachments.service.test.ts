import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks for external collaborators -------------------------------------
const prismaMock = {
    caseAttachment: {
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
    },
    case: { findUnique: vi.fn() },
};
const sendWhatsAppFile = vi.fn();
const makePublic = vi.fn();
const uploadBuffer = vi.fn();
const deleteFile = vi.fn();
const ensureCustomerFolder = vi.fn();

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../core/services/waapi/waapi.service.js", () => ({ sendWhatsAppFile }));
vi.mock("../../core/services/google/drive.js", () => ({
    driveService: { makePublic, uploadBuffer, deleteFile },
}));
vi.mock("../../core/services/google/customer-folder.js", () => ({ ensureCustomerFolder }));

const { AttachmentService } = await import("./attachments.service.js");
const service = new AttachmentService();
const admin = { id: "u1", role: "ADMIN" as const };

const caseRow = {
    id: "c1",
    customerId: "cust1",
    preferredLawyerId: null,
    sessionReceiverId: null,
    isDeleted: false,
    customer: { fullName: "Sara", phone: "966500000000" },
};

beforeEach(() => vi.clearAllMocks());

describe("AttachmentService.send", () => {
    it("sends the file to the client and stamps sentAt", async () => {
        prismaMock.caseAttachment.findUnique.mockResolvedValue({
            id: "a1",
            caseId: "c1",
            driveFileId: "drive1",
            url: "https://drive/x",
            fileName: "doc.pdf",
            mimeType: "application/pdf",
        });
        prismaMock.case.findUnique.mockResolvedValue(caseRow);
        makePublic.mockResolvedValue("https://drive.google.com/uc?export=download&id=drive1");
        prismaMock.caseAttachment.update.mockResolvedValue({ id: "a1", sentAt: new Date() });

        await service.send("a1", admin);

        expect(makePublic).toHaveBeenCalledWith("drive1");
        expect(sendWhatsAppFile).toHaveBeenCalledWith(
            "966500000000",
            "https://drive.google.com/uc?export=download&id=drive1&filename=doc.pdf",
            "doc.pdf",
        );
        expect(prismaMock.caseAttachment.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "a1" }, data: { sentAt: expect.any(Date) } }),
        );
    });

    it("rejects when the client has no phone on file", async () => {
        prismaMock.caseAttachment.findUnique.mockResolvedValue({ id: "a1", caseId: "c1" });
        prismaMock.case.findUnique.mockResolvedValue({
            ...caseRow,
            customer: { fullName: "Sara", phone: null },
        });

        await expect(service.send("a1", admin)).rejects.toMatchObject({
            message: "ATTACHMENT_NO_RECIPIENT",
        });
        expect(sendWhatsAppFile).not.toHaveBeenCalled();
    });
});

describe("AttachmentService.upload", () => {
    it("uploads to the customer folder, makes it public, and records the row", async () => {
        prismaMock.case.findUnique.mockResolvedValue(caseRow);
        ensureCustomerFolder.mockResolvedValue("folder1");
        uploadBuffer.mockResolvedValue({ id: "drive1", webViewLink: "https://view" });
        makePublic.mockResolvedValue("https://public");
        prismaMock.caseAttachment.create.mockResolvedValue({ id: "a1" });

        await service.upload(
            "c1",
            { originalname: "f.pdf", buffer: Buffer.from("x"), mimetype: "application/pdf", size: 1 },
            admin,
        );

        expect(ensureCustomerFolder).toHaveBeenCalledWith("cust1");
        expect(makePublic).toHaveBeenCalledWith("drive1");
        expect(prismaMock.caseAttachment.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ driveFileId: "drive1", url: "https://public" }),
            }),
        );
    });

    it("rejects a file type WhatsApp cannot send (no Drive upload)", async () => {
        prismaMock.case.findUnique.mockResolvedValue(caseRow);

        await expect(
            service.upload(
                "c1",
                { originalname: "archive.zip", buffer: Buffer.from("x"), mimetype: "application/zip", size: 1 },
                admin,
            ),
        ).rejects.toMatchObject({ message: "ATTACHMENT_UNSUPPORTED_TYPE" });
        expect(uploadBuffer).not.toHaveBeenCalled();
    });
});
