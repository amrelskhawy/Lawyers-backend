import express from "express";
import {
    createHoliday,
    getHolidays,
    getHolidaysInRange,
    deleteHoliday
} from "./holidays.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "@app/core/middlewares/validateRequest.js";
import { HolidaySchema } from "./holidays.types.js";

const router = express.Router();

// Public route to view holidays (or maybe protected? assuming public for now for calendar view)
// Actually, metadata endpoint covers public view. But let's allow public getting all holidays.
router.get("/", getHolidays);
router.get("/range", getHolidaysInRange);

// Admin/Moderator routes
router.post("/", protect, moderatorMiddleware, validateRequest(HolidaySchema), createHoliday);
router.delete("/:id", protect, moderatorMiddleware, deleteHoliday);

export default router;
