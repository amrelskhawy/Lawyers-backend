import express from "express";
import {
    getReminderTypes,
    listCaseReminders,
    createReminder,
    updateReminder,
    deleteReminder,
    sendMemoReminder,
    listConsultantReminders,
} from "./reminders.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateCreateReminder, validateUpdateReminder, validateMemoReminder } from "./reminders.validator.js";

const router = express.Router();

router.get("/types", protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), getReminderTypes);
router.get("/case/:caseId", protect, requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"), listCaseReminders);
router.post(
    "/",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    validateCreateReminder,
    logActivity("CREATE", "Reminder"),
    createReminder,
);
router.patch(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    validateUpdateReminder,
    logActivity("UPDATE", "Reminder"),
    updateReminder,
);
router.delete(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    logActivity("DELETE", "Reminder"),
    deleteReminder,
);

// ── Memo-request: notify consultant that the case needs a memo ──────────────
router.post(
    "/memo-request",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    validateMemoReminder,
    logActivity("CREATE", "MemoReminder"),
    sendMemoReminder,
);

// ── Consultant reminders list ────────────────────────────────────────────────
router.get(
    "/consultant",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER", "CONSULTANT"),
    listConsultantReminders,
);

export default router;
