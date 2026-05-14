import express from "express";
import {
    listFieldVisitReportsByCase,
    getFieldVisitReport,
    createFieldVisitReport,
    updateFieldVisitReport,
    deleteFieldVisitReport,
    generateFieldVisitReportPdf,
    sendFieldVisitReportToClient,
} from "./field-visit-reports.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import {
    validateCreateFieldVisitReport,
    validateUpdateFieldVisitReport,
} from "./field-visit-reports.validator.js";

const router = express.Router();

router.get("/by-case/:caseId", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), listFieldVisitReportsByCase);
router.get("/:id", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), getFieldVisitReport);
router.post("/", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), validateCreateFieldVisitReport, logActivity("CREATE", "FieldVisitReport"), createFieldVisitReport);
router.patch("/:id", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), validateUpdateFieldVisitReport, logActivity("UPDATE", "FieldVisitReport"), updateFieldVisitReport);
router.delete("/:id", protect, requireRole("ADMIN", "MODERATOR"), logActivity("DELETE", "FieldVisitReport"), deleteFieldVisitReport);

router.post("/:id/generate-pdf", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), logActivity("GENERATE_PDF", "FieldVisitReport"), generateFieldVisitReportPdf);
router.post("/:id/send-to-client", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), logActivity("SEND_TO_CLIENT", "FieldVisitReport"), sendFieldVisitReportToClient);

export default router;
