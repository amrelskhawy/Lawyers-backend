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
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { CreateServiceSchema, UpdateServiceSchema } from "./services.types.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

router.get("/:id", getService);
router.get("/", listServices); // get services only when user is logged in ( for dashboard )
router.post("/", protect, moderatorMiddleware, validateRequest(CreateServiceSchema), createService);
router.put("/:id", protect, moderatorMiddleware, validateRequest(UpdateServiceSchema), updateService);
router.delete("/bulk-delete", protect, moderatorMiddleware, validateRequest(BulkDeleteSchema as any), deleteMultipleServices);
router.delete("/:id", protect, moderatorMiddleware, deleteService);
router.patch("/:id/toggle-status", protect, moderatorMiddleware, toggleStatus);

export default router;
