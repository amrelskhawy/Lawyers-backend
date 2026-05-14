import express from "express";
import { getAllUsers, getUserById, createUser, updateUser, deleteUser, deleteMultipleUsers } from "./users.controller.js";
import { adminMiddleware, protect } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { CreateUserSchema, UpdateUserSchema } from "./users.types.js";

const router = express.Router();

router.use(protect, adminMiddleware);

router.route("/users")
    .get(getAllUsers)
    .post(validateRequest(CreateUserSchema as any), logActivity("CREATE", "User"), createUser);

router.delete("/users/many", validateRequest(BulkDeleteSchema as any), logActivity("DELETE", "User"), deleteMultipleUsers);

router.route("/users/:id")
    .get(getUserById)
    .patch(validateRequest(UpdateUserSchema as any), logActivity("UPDATE", "User"), updateUser)
    .delete(logActivity("DELETE", "User"), deleteUser);

export default router;
