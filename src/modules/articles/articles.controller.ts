import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ArticlesService } from "./articles.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const articlesService = new ArticlesService();

export const listArticles = asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await articlesService.list(req.query);
    res.status(200).json(new AppResponse(true, "ARTICLES_RETRIEVED_SUCCESS", data, 200, meta));
});

export const getArticle = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const article = await articlesService.getById(id);
    res.status(200).json(new AppResponse(true, "ARTICLE_RETRIEVED_SUCCESS", article));
});

export const createArticle = asyncHandler(async (req: AuthRequest, res: Response) => {
    const article = await articlesService.create(req.body, req.user);
    res.status(201).json(new AppResponse(true, "ARTICLE_CREATED_SUCCESS", article));
});

export const updateArticle = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const article = await articlesService.update(id, req.body, req.user);
    res.status(200).json(new AppResponse(true, "ARTICLE_UPDATED_SUCCESS", article));
});

export const toggleArticleStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const article = await articlesService.toggleStatus(id, req.user);
    res.status(200).json(new AppResponse(true, "ARTICLE_STATUS_TOGGLED_SUCCESS", article));
});

export const deleteArticle = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await articlesService.remove(id);
    res.status(200).json(new AppResponse(true, result.message, { id: result.id }));
});

export const deleteMultipleArticles = asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    const result = await articlesService.removeMany(ids);
    res.status(200).json(new AppResponse(true, "ARTICLES_DELETED_SUCCESS", result));
});

export const uploadArticleImage = asyncHandler(async (req: Request, res: Response) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
        res.status(400).json(new AppResponse(false, "IMAGE_FILE_REQUIRED", null, 400));
        return;
    }
    const result = await articlesService.uploadImage(file);
    res.status(201).json(new AppResponse(true, "ARTICLE_IMAGE_UPLOADED_SUCCESS", result));
});

// ── Public (no auth) ───────────────────────────────────────────────────────

export const listPublicArticles = asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await articlesService.listPublic(req.query);
    res.status(200).json(new AppResponse(true, "ARTICLES_RETRIEVED_SUCCESS", data, 200, meta));
});

export const getPublicArticle = asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug as string;
    const article = await articlesService.getPublicBySlug(slug);
    res.status(200).json(new AppResponse(true, "ARTICLE_RETRIEVED_SUCCESS", article));
});

/**
 * `/sitemap.xml`. Served as XML rather than through AppResponse — a crawler
 * fetching this expects a sitemap document, not the API's JSON envelope. The
 * cache header keeps a crawl burst off the database while still letting a
 * newly published article show up within the hour.
 */
export const getArticlesSitemap = asyncHandler(async (_req: Request, res: Response) => {
    const xml = await articlesService.sitemap();
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(xml);
});
