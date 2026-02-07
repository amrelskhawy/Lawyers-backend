import express from "express";
import {
    createHoliday,
    getHolidays,
    deleteHoliday
} from "./holidays.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Public route to view holidays (or maybe protected? assuming public for now for calendar view)
// Actually, metadata endpoint covers public view. But let's allow public getting all holidays.
router.get("/", getHolidays);

// Admin/Moderator routes
router.post("/", protect, moderatorMiddleware, createHoliday);
router.delete("/:id", protect, moderatorMiddleware, deleteHoliday);

export default router;
