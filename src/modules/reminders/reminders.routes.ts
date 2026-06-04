import express from "express";
import {
    getReminderTypes,
    listCaseReminders,
    createReminder,
    updateReminder,
    deleteReminder,
} from "./reminders.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateCreateReminder, validateUpdateReminder } from "./reminders.validator.js";

const router = express.Router();

router.get("/types", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), getReminderTypes);
router.get("/case/:caseId", protect, requireRole("ADMIN", "MODERATOR", "LAWYER"), listCaseReminders);
router.post(
    "/",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    validateCreateReminder,
    logActivity("CREATE", "Reminder"),
    createReminder,
);
router.patch(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    validateUpdateReminder,
    logActivity("UPDATE", "Reminder"),
    updateReminder,
);
router.delete(
    "/:id",
    protect,
    requireRole("ADMIN", "MODERATOR", "LAWYER"),
    logActivity("DELETE", "Reminder"),
    deleteReminder,
);

export default router;
