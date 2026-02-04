import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ModeratorService } from "./moderators.service.js";
import { AppError } from "../../core/utils/AppError.js";

const moderatorService = new ModeratorService();

export const createModerator = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    if (!name) throw new AppError("Name is required", 400, "AUTH_NAME_REQUIRED");
    if (!email) throw new AppError("Email is required", 400, "AUTH_EMAIL_REQUIRED");
    if (!password) throw new AppError("Password is required", 400, "AUTH_PASSWORD_REQUIRED");

    if (password.length < 6) {
        throw new AppError("Password must be at least 6 characters", 400, "AUTH_PASSWORD_TOO_SHORT");
    }

    const moderator = await moderatorService.createModerator({ name, email, password });
    res.status(201).json(moderator);
});

export const getAllModerators = asyncHandler(async (req: Request, res: Response) => {
    const moderators = await moderatorService.getAllModerators();
    res.status(200).json(moderators);
});

export const deleteModerator = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await moderatorService.deleteModerator(id);
    res.status(200).json(result);
});
