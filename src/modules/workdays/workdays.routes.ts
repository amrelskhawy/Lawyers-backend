import express from "express";
import { getAllWorkingDays, updateWorkingDays } from "./workday.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { UpdateWorkingDaySchema } from "./workday.types.js";

const router = express.Router();

router.get("/", getAllWorkingDays);
router.patch("/",
  protect,
  requireRole("ADMIN", "MODERATOR"),
  validateRequest(UpdateWorkingDaySchema),
  logActivity("UPDATE", "WorkingDay"),
  updateWorkingDays
);

export default router;
