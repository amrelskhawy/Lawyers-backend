import express from "express";
import {
    listServices,
    getService,
    createService,
    updateService,
    deleteService,
    deleteMultipleServices,
    toggleStatus,
} from "./services.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { validateCreateService, validateUpdateService } from "./services.validator.js";

const router = express.Router();

router.get("/:id", getService);
router.get("/", listServices); // get services only when user is logged in ( for dashboard )
router.post("/", protect, requireRole("ADMIN", "MODERATOR"), validateCreateService, logActivity("CREATE", "Service"), createService);
router.put("/:id", protect, requireRole("ADMIN", "MODERATOR"), validateUpdateService, logActivity("UPDATE", "Service"), updateService);
router.delete("/many", protect, requireRole("ADMIN", "MODERATOR"), validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Service"), deleteMultipleServices);
router.delete("/:id", protect, requireRole("ADMIN", "MODERATOR"), logActivity("DELETE", "Service"), deleteService);
router.patch("/:id/toggle-status", protect, requireRole("ADMIN", "MODERATOR"), logActivity("TOGGLE_STATUS", "Service"), toggleStatus);

export default router;
