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
const {
    slugify,
    deriveMetaDescription,
    articleUrl,
    buildSitemapXml,
    normalizeArabic,
    detectLanguage,
    buildSearchText,
} = await import("./utils/index.js");
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

describe("deriveMetaDescription", () => {
    it("prefers the writer's override over the excerpt", () => {
        expect(
            deriveMetaDescription({ metaDescription: "  Chosen  ", excerpt: "Fallback" }),
        ).toBe("Chosen");
    });

    it("falls back to the excerpt, then to the stripped body", () => {
        expect(deriveMetaDescription({ excerpt: "From excerpt" })).toBe("From excerpt");
        expect(deriveMetaDescription({ content: "<p>From <b>body</b></p>" })).toBe("From body");
    });

    it("truncates on a word boundary so the snippet never ends mid-word", () => {
        const source = "لفظ ".repeat(80);
        const description = deriveMetaDescription({ metaDescription: source.trim() });

        expect(description.length).toBeLessThanOrEqual(161);
        expect(description.endsWith("…")).toBe(true);

        // The kept text has to be a whole-word prefix of the original: the
        // character right after the cut is the space that ended that word.
        const kept = description.slice(0, -1);
        expect(source.startsWith(kept)).toBe(true);
        expect(source[kept.length]).toBe(" ");
    });

    it("leaves a short description untouched", () => {
        expect(deriveMetaDescription({ metaDescription: "Short one" })).toBe("Short one");
    });
});

describe("sitemap", () => {
    it("lists only published, indexable articles", async () => {
        prismaMock.article.findMany.mockResolvedValue([
            { slug: "post-a", updatedAt: new Date("2026-01-02T00:00:00Z"), publishedAt: null },
        ]);

        const xml = await service.sitemap();

        expect(prismaMock.article.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: "PUBLISHED", noIndex: false } }),
        );
        expect(xml).toContain("<loc>https://www.saadalboqami.com/articles</loc>");
        expect(xml).toContain(`<loc>${articleUrl("post-a")}</loc>`);
        expect(xml).toContain("<lastmod>2026-01-02T00:00:00.000Z</lastmod>");
    });

    it("escapes XML so an ampersand in a slug cannot break the document", () => {
        const xml = buildSitemapXml([{ loc: "https://x.test/a?b=1&c=2" }]);
        expect(xml).toContain("https://x.test/a?b=1&amp;c=2");
        expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    });
});

describe("public payloads", () => {
    it("resolves the SEO block, and its canonical matches the sitemap entry", async () => {
        prismaMock.article.findFirst.mockResolvedValue({
            id: "a1",
            slug: "workers-rights",
            title: "Workers rights",
            excerpt: "A short teaser",
            content: "<p>Body</p>",
            coverImage: "https://img.test/cover.png",
            publishedAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-02-01T00:00:00Z"),
            metaTitle: null,
            metaDescription: null,
            keywords: ["labour"],
            noIndex: false,
        });
        prismaMock.article.findMany.mockResolvedValue([]);

        const article = await service.getPublicBySlug("workers-rights");

        expect(article.seo).toMatchObject({
            title: "Workers rights",
            description: "A short teaser",
            canonical: articleUrl("workers-rights"),
            image: "https://img.test/cover.png",
            keywords: ["labour"],
            robots: "index, follow",
        });
        expect(article.seo.modifiedTime).toEqual(new Date("2026-02-01T00:00:00Z"));
    });

    it("marks a noIndex article noindex rather than hiding it", async () => {
        prismaMock.article.findFirst.mockResolvedValue({
            id: "a2",
            slug: "thin-post",
            title: "Thin post",
            excerpt: null,
            content: "<p>Body</p>",
            coverImage: null,
            publishedAt: null,
            updatedAt: null,
            metaTitle: "Custom title",
            metaDescription: null,
            keywords: [],
            noIndex: true,
        });
        prismaMock.article.findMany.mockResolvedValue([]);

        const article = await service.getPublicBySlug("thin-post");

        expect(article.seo.robots).toBe("noindex, follow");
        expect(article.seo.title).toBe("Custom title");
        expect(article.seo.description).toBe("Body");
    });
});

describe("normalizeArabic", () => {
    it("folds the hamza forms of alef onto a bare alef", () => {
        // What a reader types vs. how the article is actually spelled.
        expect(normalizeArabic("الاجراءات")).toBe(normalizeArabic("الإجراءات"));
        expect(normalizeArabic("احمد")).toBe(normalizeArabic("أحمد"));
    });

    it("strips tashkeel and tatweel", () => {
        expect(normalizeArabic("الْمُحَامَاة")).toBe(normalizeArabic("المحاماة"));
        expect(normalizeArabic("محـــاماة")).toBe(normalizeArabic("محاماة"));
    });

    it("folds ta marbuta and alef maqsura", () => {
        expect(normalizeArabic("محاماة")).toBe(normalizeArabic("محاماه"));
        expect(normalizeArabic("دعوى")).toBe(normalizeArabic("دعوي"));
    });

    it("converts Arabic-Indic digits to ASCII", () => {
        // The ta marbuta also folds to ha, so compare against the folded form:
        // the point here is only that ٢٥ and 25 end up identical.
        expect(normalizeArabic("المادة ٢٥")).toBe(normalizeArabic("المادة 25"));
        expect(normalizeArabic("المادة ٢٥")).toContain("25");
    });

    it("still folds case for Latin text", () => {
        expect(normalizeArabic("  Labour   LAW ")).toBe("labour law");
    });
});

describe("detectLanguage", () => {
    it("reads an Arabic body as Arabic", () => {
        expect(detectLanguage("حقوق العامل", "<p>نص المقال</p>")).toBe("ar");
    });

    it("reads an English body as English", () => {
        expect(detectLanguage("Workers rights", "<p>Article body</p>")).toBe("en");
    });

    it("keeps a mostly-Arabic article Arabic when it quotes English", () => {
        expect(detectLanguage("نظام العمل السعودي", "<p>وفقًا لـ Saudi Labour Law</p>")).toBe("ar");
    });
});

describe("Arabic search", () => {
    it("indexes title, keywords and body together, normalised", () => {
        const searchText = buildSearchText({
            title: "الإجراءات القضائية",
            excerpt: null,
            keywords: ["دعوى"],
            content: "<p>نص الْمَقال</p>",
        });

        expect(searchText).toContain(normalizeArabic("الاجراءات"));
        expect(searchText).toContain(normalizeArabic("دعوي"));
        expect(searchText).toContain(normalizeArabic("المقال"));
    });

    it("matches the public list against the normalised blob", async () => {
        prismaMock.article.count.mockResolvedValue(0);
        prismaMock.article.findMany.mockResolvedValue([]);

        await service.listPublic({ search: "الإجراءات" });

        expect(prismaMock.article.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    status: "PUBLISHED",
                    searchText: { contains: "الاجراءات" },
                },
            }),
        );
    });

    it("filters the public list by article language when asked", async () => {
        prismaMock.article.count.mockResolvedValue(0);
        prismaMock.article.findMany.mockResolvedValue([]);

        await service.listPublic({ language: "ar" });

        expect(prismaMock.article.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: "PUBLISHED", language: "ar" } }),
        );
    });

    it("stamps language and a rebuilt search blob on create", async () => {
        prismaMock.article.findFirst.mockResolvedValue(null);
        prismaMock.article.create.mockImplementation(({ data }: any) => data);

        const created: any = await service.create(
            { title: "حقوق العامل", content: "<p>نص</p>" } as any,
            author,
        );

        expect(created.language).toBe("ar");
        expect(created.searchText).toContain(normalizeArabic("حقوق العامل"));
    });
});

describe("slugify", () => {
    it("drops tashkeel so one title cannot produce two URLs", () => {
        expect(slugify("الْمُحَامَاة")).toBe(slugify("المحاماة"));
    });
});
