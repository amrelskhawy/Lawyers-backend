import express from "express";
import { deleteUser, getAllUsers } from "./users.controller.js";
import { adminMiddleware, creatorMiddleware, protect } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// User Management (Admin & Creator)
router.route("/users")
    .get(protect, creatorMiddleware, getAllUsers);

router.route("/users/:id")
    .delete(protect, adminMiddleware, deleteUser);

export default router;
