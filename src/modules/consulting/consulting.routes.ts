import express from "express";
import {
    listConsultingRecords,
    getConsultingRecord,
    createConsultingRecord,
    updateConsultingRecord,
    deleteConsultingRecord,
    deleteMultipleConsultingRecords,
    getConsultingSummary,
    getConsultingYears,
} from "./consulting.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { validateCreateConsulting, validateUpdateConsulting } from "./consulting.validator.js";

const router = express.Router();

router.use(protect, requireRole("ADMIN", "MODERATOR"));

router.get("/years", getConsultingYears);
router.get("/summary", getConsultingSummary);
router.get("/:id", getConsultingRecord);
router.get("/", listConsultingRecords);
router.post("/", validateCreateConsulting, logActivity("CREATE", "ConsultingRecord"), createConsultingRecord);
router.put("/:id", validateUpdateConsulting, logActivity("UPDATE", "ConsultingRecord"), updateConsultingRecord);
router.delete("/many", validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "ConsultingRecord"), deleteMultipleConsultingRecords);
router.delete("/:id", logActivity("DELETE", "ConsultingRecord"), deleteConsultingRecord);

export default router;
