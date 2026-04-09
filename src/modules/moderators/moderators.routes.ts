import express from "express";
import {
    createModerator,
    getAllModerators,
    deleteModerator,
    deleteMultipleModerators,
} from "./moderators.controller.js";
import { protect, adminMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { CreateModeratorSchema } from "./moderators.types.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

// Apply protection and admin check to all routes in this router
router.use(protect, adminMiddleware);

router.route("/")
    .post(validateRequest(CreateModeratorSchema), createModerator)
    .get(getAllModerators);

router.delete("/many", validateRequest(BulkDeleteSchema as any), deleteMultipleModerators);

router.route("/:id")
    .delete(deleteModerator);

export default router;
