import express from "express";
import { deleteUser, getAllUsers } from "./users.controller.js";
import { adminMiddleware, creatorMiddleware, protect } from "@core/middlewares/authMiddleware.js";

const router = express.Router();

router.delete("/users/:id", protect, adminMiddleware, deleteUser);
router.get("/users", protect, creatorMiddleware, getAllUsers);

export default router;
