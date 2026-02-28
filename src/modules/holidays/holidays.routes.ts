import express from "express";
import {
    createHoliday,
    getHolidays,
    getHolidaysInRange,
    deleteHoliday,
    deleteMultipleHolidays
} from "./holidays.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { HolidaySchema } from "./holidays.types.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

// Public route to view holidays (or maybe protected? assuming public for now for calendar view)
// Actually, metadata endpoint covers public view. But let's allow public getting all holidays.
router.get("/", getHolidays);
router.get("/range", getHolidaysInRange);

// Admin/Moderator routes
router.post("/", protect, moderatorMiddleware, validateRequest(HolidaySchema), createHoliday);
router.delete("/bulk-delete", protect, moderatorMiddleware, validateRequest(BulkDeleteSchema as any), deleteMultipleHolidays);
router.delete("/:id", protect, moderatorMiddleware, deleteHoliday);

export default router;
