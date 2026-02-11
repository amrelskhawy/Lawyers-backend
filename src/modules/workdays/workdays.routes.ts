import express from "express";
import { createWorkingDays, getAllWorkingDays, updateWorkingDays } from "./workday.controller.js";
import { protect, adminMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { UpdateWorkingDaySchema, WorkdaysSchema } from "./workday.types.js";

const router = express.Router();

// router.post("/",
//   createWorkingDays
// );
router.get("/", getAllWorkingDays);
router.patch("/",
  protect,
  adminMiddleware,
  validateRequest(UpdateWorkingDaySchema),
  updateWorkingDays
);

export default router;
