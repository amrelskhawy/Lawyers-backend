import express from "express";
import {
    listOrganizers,
    getOrganizer,
    createOrganizer,
    updateOrganizer,
    deleteOrganizer,
    deleteMultipleOrganizers,
} from "./organizers.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { CreateOrganizerSchema, UpdateOrganizerSchema } from "./organizers.types.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

router.get("/", protect, moderatorMiddleware, listOrganizers);
router.get("/:id", protect, moderatorMiddleware, getOrganizer);
router.post("/", protect, moderatorMiddleware, validateRequest(CreateOrganizerSchema as any), createOrganizer);
router.put("/:id", protect, moderatorMiddleware, validateRequest(UpdateOrganizerSchema as any), updateOrganizer);
router.delete("/many", protect, moderatorMiddleware, validateRequest(BulkDeleteSchema as any), deleteMultipleOrganizers);
router.delete("/:id", protect, moderatorMiddleware, deleteOrganizer);

export default router;
