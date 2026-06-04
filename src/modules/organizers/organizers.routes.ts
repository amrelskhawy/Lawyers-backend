import express from "express";
import {
    listOrganizers,
    getOrganizer,
    createOrganizer,
    updateOrganizer,
    deleteOrganizer,
    deleteMultipleOrganizers,
} from "./organizers.controller.js";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { CreateOrganizerSchema, UpdateOrganizerSchema } from "./organizers.types.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

router.get("/", protect, requireRole("ADMIN"), listOrganizers);
router.get("/:id", protect, requireRole("ADMIN"), getOrganizer);
router.post("/", protect, requireRole("ADMIN"), validateRequest(CreateOrganizerSchema as any), logActivity("CREATE", "Organizer"), createOrganizer);
router.put("/:id", protect, requireRole("ADMIN"), validateRequest(UpdateOrganizerSchema as any), logActivity("UPDATE", "Organizer"), updateOrganizer);
router.delete("/many", protect, requireRole("ADMIN"), validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Organizer"), deleteMultipleOrganizers);
router.delete("/:id", protect, requireRole("ADMIN"), logActivity("DELETE", "Organizer"), deleteOrganizer);

export default router;
