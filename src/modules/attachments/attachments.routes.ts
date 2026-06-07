import express from "express";
import multer from "multer";
import {
    listCaseAttachments,
    uploadCaseAttachment,
    sendCaseAttachment,
    deleteCaseAttachment,
} from "./attachments.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";

// Device uploads are held in memory then streamed to Drive — no disk writes.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const router = express.Router();

router.get(
    "/case/:caseId",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    listCaseAttachments,
);
router.post(
    "/case/:caseId",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    upload.single("file"),
    logActivity("CREATE", "CaseAttachment"),
    uploadCaseAttachment,
);
router.post(
    "/:id/send",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    logActivity("SEND", "CaseAttachment"),
    sendCaseAttachment,
);
router.delete(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    logActivity("DELETE", "CaseAttachment"),
    deleteCaseAttachment,
);

export default router;
