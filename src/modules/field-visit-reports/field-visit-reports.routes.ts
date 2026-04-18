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
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import {
    validateCreateFieldVisitReport,
    validateUpdateFieldVisitReport,
} from "./field-visit-reports.validator.js";

const router = express.Router();

router.get("/by-case/:caseId", protect, moderatorMiddleware, listFieldVisitReportsByCase);
router.get("/:id", protect, moderatorMiddleware, getFieldVisitReport);
router.post("/", protect, moderatorMiddleware, validateCreateFieldVisitReport, createFieldVisitReport);
router.patch("/:id", protect, moderatorMiddleware, validateUpdateFieldVisitReport, updateFieldVisitReport);
router.delete("/:id", protect, moderatorMiddleware, deleteFieldVisitReport);

router.post("/:id/generate-pdf", protect, moderatorMiddleware, generateFieldVisitReportPdf);
router.post("/:id/send-to-client", protect, moderatorMiddleware, sendFieldVisitReportToClient);

export default router;
