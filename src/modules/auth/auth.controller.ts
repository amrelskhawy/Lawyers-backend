import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";

import { AppResponse } from "../../core/utils/AppResponse.js";

const authService = new AuthService();

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    const result = await authService.register({ name, email, password });

    res.cookie("token", result.token, {
        path: "/",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "none",
        secure: true,
    });

    res.status(201).json(
        new AppResponse(
            true,
            "USER_REGISTERED_SUCCESS",
            result));
});

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email) throw new AppResponse(false, "AUTH_EMAIL_REQUIRED", null, 400);
    if (!password) throw new AppResponse(false, "AUTH_PASSWORD_REQUIRED", null, 400);

    const result = await authService.login({ email, password });

    res.cookie("token", {
        path: "/",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "none",
        secure: true,
    });

    res.status(200).json(new AppResponse(true, "USER_LOGGED_IN_SUCCESS"));
});

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        path: "/",
    });

    res.status(200).json(new AppResponse(true, "LOGGED_OUT_SUCCESS"));
});

export const verifyEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.verifyEmailInitiate(req.user.id);
    res.status(200).json(new AppResponse(true, "EMAIL_VERIFICATION_INITIATED", result));
});

export const verifyUser = asyncHandler(async (req: Request, res: Response) => {
    const { verificationToken } = req.params;
    if (!verificationToken) {
        throw new AppResponse(false, "AUTH_TOKEN_INVALID", null, 400);
    }

    const result = await authService.verifyUser(verificationToken as string);
    res.status(200).json(new AppResponse(true, "USER_VERIFIED_SUCCESS", result));
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        throw new AppResponse(false, "AUTH_EMAIL_REQUIRED", null, 400);
    }

    const result = await authService.forgotPassword(email);
    res.status(200).json(new AppResponse(true, "PASSWORD_RESET_EMAIL_SENT", result));
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { resetPasswordToken } = req.params;
    const { password } = req.body;

    if (!password) {
        throw new AppResponse(false, "AUTH_PASSWORD_REQUIRED", null, 400);
    }

    const result = await authService.resetPassword(resetPasswordToken as string, password);
    res.status(200).json(new AppResponse(true, "PASSWORD_RESET_SUCCESS", result));
});

export const userLoginStatus = asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies.token;

    if (!token) {
        res.status(200).json(false); // Should return boolean as per original, or throw 401 if strict? Original returned false on 401. Let's keep it returning status.
        return;
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET not defined");
        const decoded = jwt.verify(token, secret);
        if (decoded) {
            res.status(200).json(true);
        } else {
            res.status(200).json(false);
        }
    } catch (error) {
        res.status(200).json(false);
    }
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) {
        throw new AppResponse(false, "AUTH_PASSWORD_REQUIRED", null, 400);
    }
    if (!newPassword) {
        throw new AppResponse(false, "AUTH_NEW_PASSWORD_REQUIRED", null, 400);
    }

    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.status(200).json(new AppResponse(true, "PASSWORD_CHANGED_SUCCESS", result));
});
