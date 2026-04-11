import express from "express";
import {
    listSessionReportsByCase,
    getSessionReport,
    createSessionReport,
    updateSessionReport,
    deleteSessionReport,
    generateSessionReportPdf,
    sendSessionReportToClient,
} from "./session-reports.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import {
    validateCreateSessionReport,
    validateUpdateSessionReport,
} from "./session-reports.validator.js";

const router = express.Router();

router.get("/by-case/:caseId", protect, moderatorMiddleware, listSessionReportsByCase);
router.get("/:id", protect, moderatorMiddleware, getSessionReport);
router.post("/", protect, moderatorMiddleware, validateCreateSessionReport, createSessionReport);
router.patch("/:id", protect, moderatorMiddleware, validateUpdateSessionReport, updateSessionReport);
router.delete("/:id", protect, moderatorMiddleware, deleteSessionReport);

router.post("/:id/generate-pdf", protect, moderatorMiddleware, generateSessionReportPdf);
router.post("/:id/send-to-client", protect, moderatorMiddleware, sendSessionReportToClient);

export default router;
