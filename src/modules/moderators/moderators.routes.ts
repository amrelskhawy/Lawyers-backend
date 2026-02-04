import express from "express";
import {
    createModerator,
    getAllModerators,
    deleteModerator,
} from "./moderators.controller.js";
import { protect, adminMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Apply protection and admin check to all routes in this router
router.use(protect, adminMiddleware);

router.route("/")
    .post(createModerator)
    .get(getAllModerators);

router.route("/:id")
    .delete(deleteModerator);

export default router;
