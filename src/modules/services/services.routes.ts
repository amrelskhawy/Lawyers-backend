import express from "express";
import {
    listServices,
    getActiveServices,
    getService,
    createService,
    updateService,
    deleteService,
    activateService,
    deactivateService,
} from "./services.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", listServices);
router.get("/active", getActiveServices);
router.get("/:id", getService);

// Protected routes (moderator and admin)
router.post("/", protect, moderatorMiddleware, createService);
router.put("/:id", protect, moderatorMiddleware, updateService);
router.delete("/:id", protect, moderatorMiddleware, deleteService);
router.patch("/:id/activate", protect, moderatorMiddleware, activateService);
router.patch("/:id/deactivate", protect, moderatorMiddleware, deactivateService);

export default router;
