import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { UsersService } from "./users.service.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const usersService = new UsersService();

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await usersService.getUserById(req.user.id);
    res.status(200).json(new AppResponse(true, "USER_RETRIEVED_SUCCESS", user));
});

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
    const { role } = req.query as { role?: string };
    const { data, meta } = await usersService.listUsers(req.query, role);
    res.status(200).json(new AppResponse(true, "USERS_RETRIEVED_SUCCESS", data, 200, meta));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.getUserById(req.params["id"] as string);
    res.status(200).json(new AppResponse(true, "USER_RETRIEVED_SUCCESS", user));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.createUser(req.body);
    res.status(201).json(new AppResponse(true, "USER_CREATED_SUCCESS", user));
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params["id"] as string;
    const user = await usersService.updateUser(id, req.body);
    res.status(200).json(new AppResponse(true, "USER_UPDATED_SUCCESS", user));
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
    await usersService.deleteUser(req.params["id"] as string);
    res.status(200).json(new AppResponse(true, "USER_DELETED_SUCCESS"));
});

export const deleteMultipleUsers = asyncHandler(async (req: Request, res: Response) => {
    const result = await usersService.deleteMultipleUsers(req.body.ids);
    res.status(200).json(new AppResponse(true, "USERS_DELETED_SUCCESS", result));
});
