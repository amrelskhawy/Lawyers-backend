import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import { AppError } from "../../core/utils/AppError.js";

const authService = new AuthService();

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    if (!name) throw new AppError("Name is required", 400, "AUTH_NAME_REQUIRED");
    if (!email) throw new AppError("Email is required", 400, "AUTH_EMAIL_REQUIRED");
    if (!password) throw new AppError("Password is required", 400, "AUTH_PASSWORD_REQUIRED");

    if (password.length < 6) {
        throw new AppError("Password must be at least 6 characters", 400, "AUTH_PASSWORD_TOO_SHORT");
    }

    const result = await authService.register({ name, email, password });

    res.cookie("token", result.token, {
        path: "/",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "none",
        secure: true,
    });

    res.status(201).json(result.user);
});

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email) throw new AppError("Email is required", 400, "AUTH_EMAIL_REQUIRED");
    if (!password) throw new AppError("Password is required", 400, "AUTH_PASSWORD_REQUIRED");

    const result = await authService.login({ email, password });

    res.cookie("token", result.token, {
        path: "/",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "none",
        secure: true,
    });

    res.status(200).json(result.user);
});

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        path: "/",
    });

    res.status(200).json({ success: true, message: "Logged out successfully" });
});

export const verifyEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.verifyEmailInitiate(req.user.id);
    res.status(200).json(result);
});

export const verifyUser = asyncHandler(async (req: Request, res: Response) => {
    const { verificationToken } = req.params;
    if (!verificationToken) {
        throw new AppError("Invalid verification token", 400, "AUTH_TOKEN_INVALID");
    }

    const result = await authService.verifyUser(verificationToken as string);
    res.status(200).json(result);
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        throw new AppError("Email is required", 400, "AUTH_EMAIL_REQUIRED");
    }

    const result = await authService.forgotPassword(email);
    res.status(200).json(result);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { resetPasswordToken } = req.params;
    const { password } = req.body;

    if (!password) {
        throw new AppError("Password is required", 400, "AUTH_PASSWORD_REQUIRED");
    }

    const result = await authService.resetPassword(resetPasswordToken as string, password);
    res.status(200).json(result);
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
        throw new AppError("Current password is required", 400, "AUTH_PASSWORD_REQUIRED");
    }
    if (!newPassword) {
        throw new AppError("New password is required", 400, "AUTH_NEW_PASSWORD_REQUIRED");
    }

    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.status(200).json(result);
});
