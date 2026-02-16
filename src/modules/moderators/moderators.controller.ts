import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ModeratorService } from "./moderators.service.js";
import { AppError } from "../../core/utils/AppError.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const moderatorService = new ModeratorService();

export const createModerator = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    if (password.length < 6) {
        throw new AppError("Password must be at least 6 characters", 400, "AUTH_PASSWORD_TOO_SHORT");
    }

    const moderator = await moderatorService.createModerator({ name, email, password });
    res.status(201).json(new AppResponse(true, "MODERATOR_CREATED_SUCCESS", moderator));
});

export const getAllModerators = asyncHandler(async (req: Request, res: Response) => {
    const moderators = await moderatorService.getAllModerators();
    res.status(200).json(new AppResponse(true, "MODERATORS_RETRIEVED_SUCCESS", moderators));
});

export const deleteModerator = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await moderatorService.deleteModerator(id);
    res.status(200).json(new AppResponse(true, "MODERATOR_DELETED_SUCCESS"));
});
