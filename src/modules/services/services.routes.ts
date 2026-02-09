import express from "express";
import {
    listServices,
    getService,
    createService,
    updateService,
    deleteService,
} from "./services.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", listServices);
router.get("/:id", getService);

// Protected routes (moderator and admin)
router.post("/", protect, moderatorMiddleware, createService);
router.put("/:id", protect, moderatorMiddleware, updateService);
router.delete("/:id", protect, moderatorMiddleware, deleteService);

export default router;
