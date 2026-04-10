import express from "express";
import {
    listCases,
    listLawyers,
    getCase,
    createCase,
    updateCase,
    deleteCase,
    generateCasePdf,
    sendCaseToClient,
    sendCaseToWhatsapp
} from "./cases.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateCreateCase, validateUpdateCase } from "./cases.validator.js";

const router = express.Router();

router.get("/", protect, moderatorMiddleware, listCases);
router.get("/lawyers", protect, moderatorMiddleware, listLawyers);
router.get("/:id", protect, moderatorMiddleware, getCase);
router.post("/", protect, moderatorMiddleware, validateCreateCase, createCase);
router.patch("/:id", protect, moderatorMiddleware, validateUpdateCase, updateCase);
router.delete("/:id", protect, moderatorMiddleware, deleteCase);

router.post("/:id/generate-pdf", protect, moderatorMiddleware, generateCasePdf);
router.post("/:id/send-to-client", protect, moderatorMiddleware, sendCaseToClient);
router.post("/:id/send-whatsapp", protect, moderatorMiddleware, sendCaseToWhatsapp);

export default router;
