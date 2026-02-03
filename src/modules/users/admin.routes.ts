import express from "express";
import { deleteUser, getAllUsers } from "./users.controller.js";
import { adminMiddleware, protect } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// User Management (Admin)
router.route("/users")
    .get(protect, getAllUsers);

router.route("/users/:id")
    .delete(protect, adminMiddleware, deleteUser);

export default router;
