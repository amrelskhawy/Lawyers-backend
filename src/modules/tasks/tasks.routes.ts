import express from "express";
import {
    listTasks,
    listAssignableUsers,
    getOpenTasksCount,
    getTask,
    createTask,
    updateTask,
    updateTaskProgress,
    deleteTask,
    deleteMultipleTasks,
} from "./tasks.controller.js";
import { protect } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { CreateTaskSchema, UpdateTaskSchema, UpdateTaskProgressSchema } from "./tasks.validator.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";

const router = express.Router();

// No requireRole anywhere in this module: every authenticated staff member gets
// tasks, and what they may see is decided per-row by the scope filter in the
// service — not by role.
router.get("/", protect, listTasks);
router.get("/assignable-users", protect, listAssignableUsers);
router.get("/open-count", protect, getOpenTasksCount);
router.get("/:id", protect, getTask);
router.post("/", protect, validateRequest(CreateTaskSchema as any), logActivity("CREATE", "Task"), createTask);
router.put("/:id", protect, validateRequest(UpdateTaskSchema as any), logActivity("UPDATE", "Task"), updateTask);
router.patch("/:id/progress", protect, validateRequest(UpdateTaskProgressSchema as any), logActivity("UPDATE_PROGRESS", "Task"), updateTaskProgress);
router.delete("/many", protect, validateRequest(BulkDeleteSchema as any), logActivity("DELETE_MANY", "Task"), deleteMultipleTasks);
router.delete("/:id", protect, logActivity("DELETE", "Task"), deleteTask);

export default router;
