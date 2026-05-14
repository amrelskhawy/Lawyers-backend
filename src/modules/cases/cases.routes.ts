import express from "express";
import {
    listCases,
    listLawyers,
    getCase,
    createCase,
    updateCase,
    deleteCase,
    assignCase,
    acceptCaseAssignment,
    rejectCaseAssignment,
    generateCasePdf,
    sendCaseToClient,
} from "./cases.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateCreateCase, validateUpdateCase, validateAssignCase } from "./cases.validator.js";

const router = express.Router();

router.get(
    "/",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST", "LAWYER"),
    listCases,
);
router.get(
    "/lawyers",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"),
    listLawyers,
);
router.get(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST", "LAWYER"),
    getCase,
);
router.post(
    "/",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"),
    validateCreateCase,
    logActivity("CREATE", "Case"),
    createCase,
);
router.patch(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    validateUpdateCase,
    logActivity("UPDATE", "Case"),
    updateCase,
);
router.delete(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR"),
    logActivity("DELETE", "Case"),
    deleteCase,
);

// Assignment flow
router.patch(
    "/:id/assign",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"),
    validateAssignCase,
    logActivity("ASSIGN", "Case"),
    assignCase,
);
router.patch(
    "/:id/assignment/accept",
    protect,
    requireRole("LAWYER"),
    logActivity("ACCEPT_ASSIGNMENT", "Case"),
    acceptCaseAssignment,
);
router.patch(
    "/:id/assignment/reject",
    protect,
    requireRole("LAWYER"),
    logActivity("REJECT_ASSIGNMENT", "Case"),
    rejectCaseAssignment,
);

router.post(
    "/:id/generate-pdf",
    protect,
    requireRole("ADMIN", "LAWYER"),
    logActivity("GENERATE_PDF", "Case"),
    generateCasePdf,
);
router.post(
    "/:id/send-to-client",
    protect,
    requireRole("ADMIN", "LAWYER"),
    logActivity("SEND_TO_CLIENT", "Case"),
    sendCaseToClient,
);

export default router;
