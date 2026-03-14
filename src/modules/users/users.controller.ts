import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { UsersService } from "./users.service.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const usersService = new UsersService();

export const getUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        res.status(200).json(new AppResponse(true, "USER_RETRIEVED_SUCCESS", user));
    } catch (error: any) {
        res.status(404).json({ message: error.message });
    }
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;
        const updatedUser = await usersService.updateUser(req.user.id, { name });
        res.status(200).json(new AppResponse(true, "USER_UPDATED_SUCCESS", updatedUser));
    } catch (error: any) {
        res.status(404).json({ message: error.message });
    }
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    try {
        const { role } = req.query as { role: string };
        const users = await usersService.getAllUsers(role?.toUpperCase() as 'ADMIN' | 'MODERATOR');
        res.status(200).json(new AppResponse(true, "USERS_RETRIEVED_SUCCESS", users));
    } catch (error: any) {
        res.status(500).json({ message: "Cannot get users" });
    }
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await usersService.deleteUser(id as string);
        res.status(200).json(new AppResponse(true, "USER_DELETED_SUCCESS"));
    } catch (error: any) {
        res.status(500).json({ message: "Cannot Delete User" });
    }
});

export const deleteMultipleUsers = asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    try {
        const result = await usersService.deleteMultipleUsers(ids);
        res.status(200).json(new AppResponse(true, "USERS_DELETED_SUCCESS", result));
    } catch (error: any) {
        res.status(500).json({ message: "Cannot Delete Users" });
    }
});
