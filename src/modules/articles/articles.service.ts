import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { buildMeta, parseListQuery } from "../../core/utils/pagination.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureArticleImagesFolder } from "../../core/services/google/article-images-folder.js";
import { htmlToText, sanitizeArticleHtml } from "../../core/utils/html-sanitize.js";
import type { CreateArticlePayload, UpdateArticlePayload } from "./articles.validator.js";
import {
    Actor,
    articleInclude,
    articleUrl,
    buildSearchText,
    buildSitemapXml,
    deriveExcerpt,
    deriveMetaDescription,
    detectLanguage,
    EXCERPT_LENGTH,
    localeFor,
    normalizeArabic,
    PUBLIC_SELECT,
    SITE_URL,
    slugify,
} from "./utils/index.js";


export class ArticlesService {
    /**
     * Make `base` unique by appending -2, -3, … Skips `ignoreId` so re-saving an
     * article under its own slug does not bump it.
     */
    private async uniqueSlug(base: string, ignoreId?: string): Promise<string> {
        let candidate = base;
        for (let suffix = 2; ; suffix++) {
            const clash = await prisma.article.findFirst({
                where: { slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
                select: { id: true },
            });
            if (!clash) return candidate;
            candidate = `${base}-${suffix}`;
        }
    }

    // ── Dashboard ──────────────────────────────────────────────────────────

    /** Paginated list for the dashboard table — drafts included. */
    async list(query: Record<string, unknown>) {
        const q = parseListQuery(query, { defaultLimit: 10 });

        const where: Prisma.ArticleWhereInput = {};
        if (query.status === "DRAFT" || query.status === "PUBLISHED") {
            where.status = query.status;
        }
        if (q.search) {
            // Matched against the normalised blob, not the display columns, so
            // "الاجراءات" finds an article titled "الإجراءات".
            where.searchText = { contains: normalizeArabic(q.search) };
        }

        const orderBy: Prisma.ArticleOrderByWithRelationInput = q.sortBy
            ? { [q.sortBy]: q.sortOrder }
            : { createdAt: "desc" };

        const [total, data] = await Promise.all([
            prisma.article.count({ where }),
            prisma.article.findMany({
                where,
                include: articleInclude,
                orderBy,
                skip: q.skip,
                take: q.take,
            }),
        ]);

        return { data, meta: buildMeta(total, q.page, q.limit) };
    }

    async getById(id: string) {
        const article = await prisma.article.findUnique({ where: { id }, include: articleInclude });
        if (!article) throw new AppResponse(false, "ARTICLE_NOT_FOUND", null, 404);
        return article;
    }

    async create(payload: CreateArticlePayload, user: Actor) {
        const content = sanitizeArticleHtml(payload.content);
        const status = payload.status ?? "DRAFT";
        const slug = await this.uniqueSlug(payload.slug ?? slugify(payload.title));

        const fields = {
            title: payload.title,
            excerpt: payload.excerpt?.trim() || deriveExcerpt(content),
            content,
            metaTitle: payload.metaTitle?.trim() || null,
            metaDescription: payload.metaDescription?.trim() || null,
            keywords: payload.keywords ?? [],
        };

        return prisma.article.create({
            data: {
                slug,
                ...fields,
                coverImage: payload.coverImage ?? null,
                noIndex: payload.noIndex ?? false,
                language: payload.language ?? detectLanguage(payload.title, content),
                searchText: buildSearchText(fields),
                status,
                publishedAt: status === "PUBLISHED" ? new Date() : null,
                createdById: user.id,
                updatedById: user.id,
            },
            include: articleInclude,
        });
    }

    async update(id: string, payload: UpdateArticlePayload, user: Actor) {
        const existing = await prisma.article.findUnique({ where: { id } });
        if (!existing) throw new AppResponse(false, "ARTICLE_NOT_FOUND", null, 404);

        const content =
            payload.content !== undefined ? sanitizeArticleHtml(payload.content) : undefined;

        const data: Prisma.ArticleUpdateInput = {
            title: payload.title,
            content,
            coverImage: payload.coverImage,
            status: payload.status,
            noIndex: payload.noIndex,
            updatedBy: { connect: { id: user.id } },
        };

        // Blanking an SEO override in the form clears it, so the public payload
        // goes back to falling back on the title/excerpt.
        if (payload.metaTitle !== undefined) data.metaTitle = payload.metaTitle?.trim() || null;
        if (payload.metaDescription !== undefined) {
            data.metaDescription = payload.metaDescription?.trim() || null;
        }
        if (payload.keywords !== undefined) data.keywords = payload.keywords;

        // An explicit slug wins; otherwise a renamed title re-derives one.
        if (payload.slug) {
            data.slug = await this.uniqueSlug(payload.slug, id);
        } else if (payload.title && payload.title !== existing.title) {
            data.slug = await this.uniqueSlug(slugify(payload.title), id);
        }

        // An emptied excerpt falls back to the (new or stored) body.
        if (payload.excerpt !== undefined) {
            data.excerpt =
                payload.excerpt?.trim() || deriveExcerpt(content ?? existing.content);
        } else if (content) {
            // Body changed while the excerpt was auto-derived — keep them in sync.
            if (existing.excerpt === deriveExcerpt(existing.content)) {
                data.excerpt = deriveExcerpt(content);
            }
        }

        // First publish stamps the date; later edits never move it.
        if (payload.status === "PUBLISHED" && !existing.publishedAt) {
            data.publishedAt = new Date();
        }

        // The search blob and the language are derived, never sent by the
        // client — so they are rebuilt from the merged row rather than patched
        // field by field, which is what keeps them from drifting out of sync
        // with the article after a partial update.
        const merged = {
            title: (data.title as string | undefined) ?? existing.title,
            excerpt: (data.excerpt as string | null | undefined) ?? existing.excerpt,
            content: content ?? existing.content,
            metaTitle: (data.metaTitle as string | null | undefined) ?? existing.metaTitle,
            metaDescription:
                (data.metaDescription as string | null | undefined) ?? existing.metaDescription,
            keywords: (data.keywords as string[] | undefined) ?? existing.keywords,
        };
        data.searchText = buildSearchText(merged);
        data.language = payload.language ?? detectLanguage(merged.title, merged.content);

        return prisma.article.update({ where: { id }, data, include: articleInclude });
    }

    /** Flip DRAFT ⇄ PUBLISHED from the list row without opening the editor. */
    async toggleStatus(id: string, user: Actor) {
        const existing = await prisma.article.findUnique({ where: { id } });
        if (!existing) throw new AppResponse(false, "ARTICLE_NOT_FOUND", null, 404);

        const status = existing.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
        return prisma.article.update({
            where: { id },
            data: {
                status,
                publishedAt:
                    status === "PUBLISHED" && !existing.publishedAt ? new Date() : undefined,
                updatedById: user.id,
            },
            include: articleInclude,
        });
    }

    async remove(id: string) {
        const existing = await prisma.article.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new AppResponse(false, "ARTICLE_NOT_FOUND", null, 404);

        await prisma.article.delete({ where: { id } });
        return { message: "ARTICLE_DELETED_SUCCESS", id };
    }

    async removeMany(ids: string[]) {
        const result = await prisma.article.deleteMany({ where: { id: { in: ids } } });
        return { deletedCount: result.count };
    }

    /**
     * Upload a cover or in-body image to the shared Drive folder and return a
     * URL that renders inline in an `<img>` — same approach as profile images.
     */
    async uploadImage(file: Express.Multer.File) {
        if (!file.mimetype.startsWith("image/")) {
            throw new AppResponse(false, "IMAGE_INVALID_TYPE", null, 400);
        }

        const folderId = await ensureArticleImagesFolder();
        const safeName = file.originalname.replace(/[^\w.\-]+/g, "_").slice(-80);
        const uploaded = await driveService.uploadBuffer(
            `article-${Date.now()}-${safeName}`,
            file.buffer,
            folderId,
            file.mimetype,
        );
        if (!uploaded.id) throw new AppResponse(false, "DRIVE_UPLOAD_FAILED", null, 500);

        await driveService.makePublic(uploaded.id);
        // The thumbnail endpoint serves the bytes inline; the uc?export link
        // prompts a download and is blocked for hotlinking in <img>.
        const url = `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w1200`;
        return { url, fileId: uploaded.id };
    }

    // ── Public site ────────────────────────────────────────────────────────

    /**
     * Resolves every SEO fallback server-side and hands the reader page a ready
     * `seo` block. The frontend must not re-derive any of this: the canonical
     * URL here is the same string the sitemap emits, and a mismatch between the
     * two is what makes Google drop a page from the index.
     */
    private withSeo<T extends {
        slug: string;
        title: string;
        excerpt?: string | null;
        content?: string;
        coverImage?: string | null;
        publishedAt?: Date | null;
        updatedAt?: Date | null;
        metaTitle?: string | null;
        metaDescription?: string | null;
        keywords?: string[];
        noIndex?: boolean;
        language?: string;
    }>(article: T) {
        const language = article.language === "en" ? "en" : "ar";
        return {
            ...article,
            seo: {
                // The article's own language, not the reader's UI language —
                // an Arabic post shared from an English-language session still
                // has to announce itself to crawlers as Arabic.
                language,
                locale: localeFor(language),
                dir: language === "ar" ? "rtl" : "ltr",
                title: article.metaTitle?.trim() || article.title,
                description: deriveMetaDescription(article),
                canonical: articleUrl(article.slug),
                image: article.coverImage ?? null,
                keywords: article.keywords ?? [],
                // `noindex` also has to keep the page out of the sitemap — see
                // sitemap() below, which filters on the same flag.
                robots: article.noIndex ? "noindex, follow" : "index, follow",
                publishedTime: article.publishedAt ?? null,
                modifiedTime: article.updatedAt ?? article.publishedAt ?? null,
            },
        };
    }

    /**
     * `/sitemap.xml` for the blog. Only published, indexable articles — listing
     * a draft or a noindex page is a crawl-budget leak and shows up in Search
     * Console as a "submitted URL marked noindex" error.
     */
    async sitemap() {
        const articles = await prisma.article.findMany({
            where: { status: "PUBLISHED", noIndex: false },
            select: { slug: true, updatedAt: true, publishedAt: true },
            orderBy: [{ publishedAt: "desc" }],
        });

        return buildSitemapXml([
            { loc: `${SITE_URL}/articles`, changefreq: "daily", priority: "0.8" },
            ...articles.map((article) => ({
                loc: articleUrl(article.slug),
                lastmod: article.updatedAt ?? article.publishedAt,
                changefreq: "weekly",
                priority: "0.7",
            })),
        ]);
    }

    /** Published articles only, newest first — what the blog page lists. */
    async listPublic(query: Record<string, unknown>) {
        const q = parseListQuery(query, { defaultLimit: 9, maxLimit: 50 });

        const where: Prisma.ArticleWhereInput = { status: "PUBLISHED" };
        if (q.search) {
            where.searchText = { contains: normalizeArabic(q.search) };
        }
        // Lets the blog show only the articles written in the language the
        // reader is browsing in, instead of mixing both into one list.
        if (query.language === "ar" || query.language === "en") {
            where.language = query.language;
        }

        const [total, data] = await Promise.all([
            prisma.article.count({ where }),
            prisma.article.findMany({
                where,
                // The list only needs the card — the body stays with the reader page.
                select: { ...PUBLIC_SELECT, content: false },
                orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
                skip: q.skip,
                take: q.take,
            }),
        ]);

        return { data: data.map((row) => this.withSeo(row)), meta: buildMeta(total, q.page, q.limit) };
    }

    /** One published article by its URL key. A draft reads as "not found". */
    async getPublicBySlug(slug: string) {
        const article = await prisma.article.findFirst({
            where: { slug, status: "PUBLISHED" },
            select: PUBLIC_SELECT,
        });
        if (!article) throw new AppResponse(false, "ARTICLE_NOT_FOUND", null, 404);

        // Small "keep reading" rail — never the article being read.
        const related = await prisma.article.findMany({
            where: { status: "PUBLISHED", id: { not: article.id } },
            select: { ...PUBLIC_SELECT, content: false },
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            take: 3,
        });

        return { ...this.withSeo(article), related: related.map((row) => this.withSeo(row)) };
    }
}
