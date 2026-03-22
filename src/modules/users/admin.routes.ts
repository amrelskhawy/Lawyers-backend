import express from "express";
import { deleteUser, deleteMultipleUsers, getAllUsers } from "./users.controller.js";
import { adminMiddleware, protect } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

// User Management (Admin)
router.route("/users")
    .get(protect, getAllUsers);

router.route("/users/many")
    .delete(protect, adminMiddleware, validateRequest(BulkDeleteSchema as any), deleteMultipleUsers);

router.route("/users/:id")
    .delete(protect, adminMiddleware, deleteUser);

export default router;
