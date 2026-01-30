import { Router } from "express";
import { deleteUser, getAllUsers } from "../../../models/users/adminController.js";
import { adminMiddleware, creatorMiddleware, protect } from "../../../models/auth/middlewares/authMiddleware.js";

const router = Router();

// admin route
router.delete("/users/:id", protect, adminMiddleware, deleteUser);

// get all users
router.get("/users", protect, creatorMiddleware, getAllUsers);

export default router;
