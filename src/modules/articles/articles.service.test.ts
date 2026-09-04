import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks for external collaborators -------------------------------------
const prismaMock = {
    article: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
    },
};
const uploadBuffer = vi.fn();
const makePublic = vi.fn();
const ensureArticleImagesFolder = vi.fn();

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../core/services/google/drive.js", () => ({
    driveService: { uploadBuffer, makePublic },
}));
vi.mock("../../core/services/google/article-images-folder.js", () => ({
    ensureArticleImagesFolder,
}));

const { ArticlesService } = await import("./articles.service.js");
const { slugify } = await import("./utils/index.js");
const service = new ArticlesService();
const author = { id: "u1" };

beforeEach(() => vi.clearAllMocks());

describe("slugify", () => {
    it("lowercases and dashes a latin title", () => {
        expect(slugify("  How to File an Appeal! ")).toBe("how-to-file-an-appeal");
    });

    it("keeps Arabic letters", () => {
        expect(slugify("حقوق العامل في النظام")).toBe("حقوق-العامل-في-النظام");
    });

    it("never returns an empty slug", () => {
        expect(slugify("!!! ???")).toMatch(/^article-\d+$/);
    });
});

describe("create", () => {
    it("stores a sanitised body and derives slug + excerpt", async () => {
        prismaMock.article.findFirst.mockResolvedValue(null);
        prismaMock.article.create.mockImplementation(({ data }: any) => data);

        const data: any = await service.create(
            {
                title: "Know Your Rights",
                content: '<p>Read <b>this</b></p><script>alert(1)</script>',
            },
            author,
        );

        expect(data.slug).toBe("know-your-rights");
        expect(data.content).toBe("<p>Read <b>this</b></p>");
        expect(data.excerpt).toBe("Read this");
        // Nothing is public until someone publishes it.
        expect(data.status).toBe("DRAFT");
        expect(data.publishedAt).toBeNull();
    });

    it("stamps publishedAt when created already published", async () => {
        prismaMock.article.findFirst.mockResolvedValue(null);
        prismaMock.article.create.mockImplementation(({ data }: any) => data);

        const data: any = await service.create(
            { title: "Launch", content: "<p>Hello</p>", status: "PUBLISHED" },
            author,
        );

        expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it("suffixes a slug that is already taken", async () => {
        prismaMock.article.findFirst
            .mockResolvedValueOnce({ id: "other" })
            .mockResolvedValueOnce(null);
        prismaMock.article.create.mockImplementation(({ data }: any) => data);

        const data: any = await service.create({ title: "Appeal", content: "<p>x</p>" }, author);

        expect(data.slug).toBe("appeal-2");
    });
});

describe("update", () => {
    const stored = {
        id: "a1",
        title: "Old title",
        slug: "old-title",
        excerpt: "Old body",
        content: "<p>Old body</p>",
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
    };

    it("re-slugs on a renamed title", async () => {
        prismaMock.article.findUnique.mockResolvedValue(stored);
        prismaMock.article.findFirst.mockResolvedValue(null);
        prismaMock.article.update.mockImplementation(({ data }: any) => data);

        const data: any = await service.update("a1", { title: "New title" }, author);

        expect(data.slug).toBe("new-title");
    });

    it("keeps the original publish date across later edits", async () => {
        prismaMock.article.findUnique.mockResolvedValue(stored);
        prismaMock.article.update.mockImplementation(({ data }: any) => data);

        const data: any = await service.update("a1", { status: "PUBLISHED" }, author);

        expect(data.publishedAt).toBeUndefined();
    });

    it("refreshes an auto-derived excerpt when the body changes", async () => {
        prismaMock.article.findUnique.mockResolvedValue(stored);
        prismaMock.article.update.mockImplementation(({ data }: any) => data);

        const data: any = await service.update("a1", { content: "<p>Fresh body</p>" }, author);

        expect(data.excerpt).toBe("Fresh body");
    });

    it("leaves a hand-written excerpt alone when the body changes", async () => {
        prismaMock.article.findUnique.mockResolvedValue({ ...stored, excerpt: "Hand written" });
        prismaMock.article.update.mockImplementation(({ data }: any) => data);

        const data: any = await service.update("a1", { content: "<p>Fresh body</p>" }, author);

        expect(data.excerpt).toBeUndefined();
    });

    it("404s on a missing article", async () => {
        prismaMock.article.findUnique.mockResolvedValue(null);

        await expect(service.update("nope", { title: "x" }, author)).rejects.toMatchObject({
            statusCode: 404,
            message: "ARTICLE_NOT_FOUND",
        });
    });
});

describe("public reads", () => {
    it("treats a draft slug as not found", async () => {
        prismaMock.article.findFirst.mockResolvedValue(null);

        await expect(service.getPublicBySlug("draft-piece")).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    it("lists published articles only", async () => {
        prismaMock.article.count.mockResolvedValue(0);
        prismaMock.article.findMany.mockResolvedValue([]);

        await service.listPublic({});

        expect(prismaMock.article.count).toHaveBeenCalledWith({
            where: { status: "PUBLISHED" },
        });
    });
});

describe("uploadImage", () => {
    it("rejects a non-image file", async () => {
        await expect(
            service.uploadImage({ mimetype: "application/pdf" } as any),
        ).rejects.toMatchObject({ statusCode: 400, message: "IMAGE_INVALID_TYPE" });
    });

    it("returns an inline-renderable Drive URL", async () => {
        ensureArticleImagesFolder.mockResolvedValue("folder1");
        uploadBuffer.mockResolvedValue({ id: "file1" });

        const result = await service.uploadImage({
            mimetype: "image/png",
            originalname: "my photo.png",
            buffer: Buffer.from(""),
        } as any);

        expect(result).toEqual({
            url: "https://drive.google.com/thumbnail?id=file1&sz=w1200",
            fileId: "file1",
        });
        expect(makePublic).toHaveBeenCalledWith("file1");
    });
});
