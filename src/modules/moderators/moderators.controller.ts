import { Response } from "express";
import asyncHandler from "express-async-handler";
import { ModeratorService } from "./moderators.service.js";

import { AppResponse } from "../../core/utils/AppResponse.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import { Role } from "@prisma/client";

const moderatorService = new ModeratorService();

export const createModerator = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, email, password } = req.body;

    if (password.length < 6) {
        throw new AppResponse(false, "AUTH_PASSWORD_TOO_SHORT", null, 400);
    }

    const moderator = await moderatorService.createModerator({ name, email, password });
    res.status(201).json(new AppResponse(true, "MODERATOR_CREATED_SUCCESS", moderator));
});

export const getAllModerators = asyncHandler(async (req: AuthRequest, res: Response) => {
    const moderators = await moderatorService.getAllModerators();
    res.status(200).json(new AppResponse(true, "MODERATORS_RETRIEVED_SUCCESS", moderators));
});

export const deleteModerator = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const isAdmin = req.user?.role === Role.ADMIN;

    if (!isAdmin) {
        throw new AppResponse(false, "ADMIN_ROLE_REQUIRED", null, 401);
    }
    const result = await moderatorService.deleteModerator(id);
    res.status(200).json(new AppResponse(true, "MODERATOR_DELETED_SUCCESS"));
});
