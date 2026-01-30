import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { UsersService } from "./users.service.js";
import { AuthRequest } from "@core/middlewares/authMiddleware.js";

const usersService = new UsersService();

export const getUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        res.status(200).json(user);
    } catch (error: any) {
        res.status(404).json({ message: error.message });
    }
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const { name, bio, photo } = req.body;
        const updatedUser = await usersService.updateUser(req.user.id, { name, bio, photo });
        res.status(200).json(updatedUser);
    } catch (error: any) {
        res.status(404).json({ message: error.message });
    }
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    try {
        const users = await usersService.getAllUsers();
        res.status(200).json(users);
    } catch (error: any) {
        res.status(500).json({ message: "Cannot get users" });
    }
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await usersService.deleteUser(id as string);
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error: any) {
        res.status(500).json({ message: "Cannot Delete User" });
    }
});
