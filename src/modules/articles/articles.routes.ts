import express from "express";
import multer from "multer";
import {
    listArticles,
    getArticle,
    createArticle,
    updateArticle,
    toggleArticleStatus,
    deleteArticle,
    deleteMultipleArticles,
    uploadArticleImage,
    listPublicArticles,
    getPublicArticle,
    getArticlesSitemap,
} from "./articles.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { CreateArticleSchema, UpdateArticleSchema } from "./articles.validator.js";

// Images are held in memory then streamed to Drive — no disk writes.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/**
 * Open reader routes for the marketing site, mounted separately at
 * `/public/articles` so nothing here sits behind `protect`. Drafts are never
 * served — the service filters on PUBLISHED.
 */
export const publicArticlesRouter = express.Router();
publicArticlesRouter.get("/", listPublicArticles);
// Ahead of "/:slug" — otherwise the sitemap request is read as a slug lookup
// and 404s.
publicArticlesRouter.get("/sitemap.xml", getArticlesSitemap);
publicArticlesRouter.get("/:slug", getPublicArticle);

const router = express.Router();

// Writing an article is an ADMIN/MODERATOR job; there is nothing here for the
// other roles, so the whole dashboard router is gated on those two.
const canManage = [protect, requireRole("ADMIN", "MODERATOR")] as const;

router.post(
    "/upload-image",
    ...canManage,
    upload.single("file"),
    uploadArticleImage,
);
router.get("/", ...canManage, listArticles);
router.get("/:id", ...canManage, getArticle);
router.post("/", ...canManage, validateRequest(CreateArticleSchema as any), logActivity("CREATE", "Article"), createArticle);
router.put("/:id", ...canManage, validateRequest(UpdateArticleSchema as any), logActivity("UPDATE", "Article"), updateArticle);
router.patch("/:id/toggle-status", ...canManage, logActivity("TOGGLE_STATUS", "Article"), toggleArticleStatus);
router.delete("/many", ...canManage, validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Article"), deleteMultipleArticles);
router.delete("/:id", ...canManage, logActivity("DELETE", "Article"), deleteArticle);

export default router;
