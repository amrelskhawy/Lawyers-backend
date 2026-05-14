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
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import {
    validateCreateSessionReport,
    validateUpdateSessionReport,
} from "./session-reports.validator.js";

const router = express.Router();

router.get("/by-case/:caseId", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), listSessionReportsByCase);
router.get("/:id", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), getSessionReport);
router.post("/", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), validateCreateSessionReport, logActivity("CREATE", "SessionReport"), createSessionReport);
router.patch("/:id", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), validateUpdateSessionReport, logActivity("UPDATE", "SessionReport"), updateSessionReport);
router.delete("/:id", protect, requireRole("ADMIN", "MODERATOR"), logActivity("DELETE", "SessionReport"), deleteSessionReport);

router.post("/:id/generate-pdf", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), logActivity("GENERATE_PDF", "SessionReport"), generateSessionReportPdf);
router.post("/:id/send-to-client", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), logActivity("SEND_TO_CLIENT", "SessionReport"), sendSessionReportToClient);

export default router;
