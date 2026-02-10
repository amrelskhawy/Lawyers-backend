import express from "express";
import {
    createModerator,
    getAllModerators,
    deleteModerator,
} from "./moderators.controller.js";
import { protect, adminMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "@app/core/middlewares/validateRequest.js";
import { CreateModeratorSchema } from "./moderators.types.js";

const router = express.Router();

// Apply protection and admin check to all routes in this router
router.use(protect, adminMiddleware);

router.route("/")
    .post(validateRequest(CreateModeratorSchema), createModerator)
    .get(getAllModerators);

router.route("/:id")
    .delete(deleteModerator);

export default router;
