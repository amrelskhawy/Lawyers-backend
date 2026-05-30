import express from "express";
import {
    createHoliday,
    getHolidays,
    getHolidaysInRange,
    deleteHoliday,
    deleteMultipleHolidays
} from "./holidays.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { HolidaySchema } from "./holidays.types.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

// Public route to view holidays (or maybe protected? assuming public for now for calendar view)
// Actually, metadata endpoint covers public view. But let's allow public getting all holidays.
router.get("/", getHolidays);
router.get("/range", getHolidaysInRange);

// Admin-only routes
router.post("/", protect, requireRole("ADMIN", "MODERATOR"), validateRequest(HolidaySchema), logActivity("CREATE", "Holiday"), createHoliday);
router.delete("/many", protect, requireRole("ADMIN", "MODERATOR"), validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Holiday"), deleteMultipleHolidays);
router.delete("/:id", protect, requireRole("ADMIN", "MODERATOR"), logActivity("DELETE", "Holiday"), deleteHoliday);

export default router;
