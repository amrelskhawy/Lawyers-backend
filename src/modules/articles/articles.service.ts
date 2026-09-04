import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { buildMeta, parseListQuery } from "../../core/utils/pagination.js";
import { driveService } from "../../core/services/google/drive.js";
import { ensureArticleImagesFolder } from "../../core/services/google/article-images-folder.js";
import { htmlToText, sanitizeArticleHtml } from "../../core/utils/html-sanitize.js";
import type { CreateArticlePayload, UpdateArticlePayload } from "./articles.validator.js";

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
            where.OR = [
                { title: { contains: q.search, mode: "insensitive" } },
                { excerpt: { contains: q.search, mode: "insensitive" } },
                { content: { contains: q.search, mode: "insensitive" } },
            ];
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

        return prisma.article.create({
            data: {
                slug,
                title: payload.title,
                excerpt: payload.excerpt?.trim() || deriveExcerpt(content),
                content,
                coverImage: payload.coverImage ?? null,
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
            updatedBy: { connect: { id: user.id } },
        };

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

    /** Published articles only, newest first — what the blog page lists. */
    async listPublic(query: Record<string, unknown>) {
        const q = parseListQuery(query, { defaultLimit: 9, maxLimit: 50 });

        const where: Prisma.ArticleWhereInput = { status: "PUBLISHED" };
        if (q.search) {
            where.OR = [
                { title: { contains: q.search, mode: "insensitive" } },
                { excerpt: { contains: q.search, mode: "insensitive" } },
            ];
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

        return { data, meta: buildMeta(total, q.page, q.limit) };
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

        return { ...article, related };
    }
}
