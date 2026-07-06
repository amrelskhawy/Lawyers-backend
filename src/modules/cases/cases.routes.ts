import express from "express";
import {
    listCases,
    listUnscheduledCases,
    listLawyers,
    getCase,
    createCase,
    updateCase,
    deleteCase,
    assignCase,
    acceptCaseAssignment,
    rejectCaseAssignment,
    unassignCase,
    setCaseSessionDate,
    setCaseCompletion,
    setCaseDegree,
    generateCasePdf,
    sendCaseToClient,
} from "./cases.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import {
    validateCreateCase,
    validateUpdateCase,
    validateAssignCase,
    validateUnassignCase,
    validateRejectAssignment,
    validateSetSessionDate,
    validateSetCompletion,
    validateSetCaseDegree,
} from "./cases.validator.js";

const router = express.Router();

router.get(
    "/",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST", "LAWYER", "CONSULTANT"),
    listCases,
);
// Cases with no session date/time set yet. ADMIN/MODERATOR see all;
// LAWYER/CONSULTANT see only their own (scoped in CasesService.buildListWhere).
// Declared before "/:id" so "unscheduled" isn't captured as a case id.
router.get(
    "/unscheduled",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    listUnscheduledCases,
);
router.get(
    "/lawyers",
    protect,
    listLawyers,
);
router.get(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST", "LAWYER", "CONSULTANT"),
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
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
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
    requireRole("LAWYER", "CONSULTANT"),
    logActivity("ACCEPT_ASSIGNMENT", "Case"),
    acceptCaseAssignment,
);
router.patch(
    "/:id/assignment/reject",
    protect,
    requireRole("LAWYER", "CONSULTANT"),
    validateRejectAssignment,
    logActivity("REJECT_ASSIGNMENT", "Case"),
    rejectCaseAssignment,
);
router.patch(
    "/:id/unassign",
    protect,
    requireRole("ADMIN", "MODERATOR", "RECEPTIONIST"),
    validateUnassignCase,
    logActivity("UNASSIGN", "Case"),
    unassignCase,
);

// Set the (Hijri) session date — auto-schedules the 3 session reminders
router.patch(
    "/:id/session",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    validateSetSessionDate,
    logActivity("SET_SESSION_DATE", "Case"),
    setCaseSessionDate,
);

// Set the litigation degree (درجة التقاضي) — from the reminders dialog
router.patch(
    "/:id/degree",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    validateSetCaseDegree,
    logActivity("SET_CASE_DEGREE", "Case"),
    setCaseDegree,
);

// Toggle "fully completed" — cancels pending reminders, blocks new ones
router.patch(
    "/:id/completion",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    validateSetCompletion,
    logActivity("SET_COMPLETION", "Case"),
    setCaseCompletion,
);

router.post(
    "/:id/generate-pdf",
    protect,
    requireRole("ADMIN", "LAWYER", "CONSULTANT"),
    logActivity("GENERATE_PDF", "Case"),
    generateCasePdf,
);
router.post(
    "/:id/send-to-client",
    protect,
    requireRole("ADMIN", "LAWYER", "CONSULTANT"),
    logActivity("SEND_TO_CLIENT", "Case"),
    sendCaseToClient,
);

export default router;
