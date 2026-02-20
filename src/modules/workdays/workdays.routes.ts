import express from "express";
import { getAllWorkingDays, updateWorkingDays } from "./workday.controller.js";
import { protect, adminMiddleware, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { UpdateWorkingDaySchema } from "./workday.types.js";

const router = express.Router();

router.get("/", getAllWorkingDays);
router.patch("/",
  protect,
  adminMiddleware,
  moderatorMiddleware,
  validateRequest(UpdateWorkingDaySchema),
  updateWorkingDays
);

export default router;
