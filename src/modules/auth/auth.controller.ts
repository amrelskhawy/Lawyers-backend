import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const authService = new AuthService();

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        res.status(400).json({ message: "All fields are required" });
        return;
    }

    if (password.length < 6) {
        res.status(400).json({ message: "Password must be at least 6 characters" });
        return;
    }

    try {
        const result = await authService.register({ name, email, password });

        res.cookie("token", result.token, {
            path: "/",
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: "none",
            secure: true,
        });

        res.status(201).json(result.user);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({ message: "All fields are required" });
        return;
    }

    try {
        const result = await authService.login({ email, password });

        res.cookie("token", result.token, {
            path: "/",
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: "none",
            secure: true,
        });

        res.status(200).json(result.user);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        path: "/",
    });

    res.status(200).json({ message: "User logged out" });
});

export const verifyEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const result = await authService.verifyEmailInitiate(req.user.id);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

export const verifyUser = asyncHandler(async (req: Request, res: Response) => {
    const { verificationToken } = req.params;
    if (!verificationToken) {
        res.status(400).json({ message: "Invalid verification token" });
        return;
    }

    try {
        const result = await authService.verifyUser(verificationToken as string);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        res.status(400).json({ message: "Email is required" });
        return;
    }

    try {
        const result = await authService.forgotPassword(email);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { resetPasswordToken } = req.params;
    const { password } = req.body;

    if (!password) {
        res.status(400).json({ message: "Password is required" });
        return;
    }

    try {
        const result = await authService.resetPassword(resetPasswordToken as string, password);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});

export const userLoginStatus = asyncHandler(async (req: Request, res: Response) => {
    const token = req.cookies.token;

    if (!token) {
        res.status(401).json(false);
        return;
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET not defined");
        const decoded = jwt.verify(token, secret);
        if (decoded) {
            res.status(200).json(true);
        } else {
            res.status(401).json(false);
        }
    } catch (error) {
        res.status(401).json(false);
    }
});

export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        res.status(400).json({ message: "All fields are required" });
        return;
    }

    try {
        const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
});
