import { Response } from "express";
import asyncHandler from "express-async-handler";
import { TasksService } from "./tasks.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import type { TaskFilters, TaskOwnership } from "./tasks.types.js";
import type { TaskPriority, TaskStatus } from "@prisma/client";

const readFilters = (query: AuthRequest["query"]): TaskFilters => {
    const pick = <T extends string>(value: unknown, allowed: readonly string[]) =>
        typeof value === "string" && allowed.includes(value) ? (value as T) : undefined;

    return {
        mine: pick<TaskOwnership>(query.mine, ["created", "assigned"]),
        status: pick<TaskStatus>(query.status, ["TODO", "IN_PROGRESS", "DONE"]),
        priority: pick<TaskPriority>(query.priority, ["LOW", "MEDIUM", "HIGH"]),
        caseId: typeof query.caseId === "string" ? query.caseId : undefined,
    };
};

export const listTasks = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.list(req.user.id, readFilters(req.query));
    res.status(200).json(new AppResponse(true, "TASKS_RETRIEVED_SUCCESS", data));
});

export const listAssignableUsers = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await TasksService.listAssignableUsers();
    res.status(200).json(new AppResponse(true, "TASK_ASSIGNABLE_USERS_RETRIEVED_SUCCESS", data));
});

export const getTask = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.getOne(req.params.id as string, req.user.id);
    res.status(200).json(new AppResponse(true, "TASK_RETRIEVED_SUCCESS", data));
});

export const createTask = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.create(req.user.id, req.body);
    res.status(201).json(new AppResponse(true, "TASK_CREATED_SUCCESS", data));
});

export const updateTask = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.update(req.params.id as string, req.user.id, req.body);
    res.status(200).json(new AppResponse(true, "TASK_UPDATED_SUCCESS", data));
});

export const updateTaskStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.updateStatus(
        req.params.id as string,
        req.user.id,
        req.body.status,
    );
    res.status(200).json(new AppResponse(true, "TASK_STATUS_UPDATED_SUCCESS", data));
});

export const deleteTask = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.remove(req.params.id as string, req.user.id);
    res.status(200).json(new AppResponse(true, "TASK_DELETED_SUCCESS", data));
});

export const deleteMultipleTasks = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await TasksService.removeMany(req.body.ids, req.user.id);
    res.status(200).json(new AppResponse(true, "TASKS_DELETED_SUCCESS", data));
});
