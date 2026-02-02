import { Request, Response, NextFunction } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import prisma from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";

interface DecodedToken {
    id: string;
}

export interface AuthRequest extends Request {
    user?: any;
}

export const protect = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.token;

    if (!token) {
        throw new AppError("Not authorized, please login", 401, "AUTH_TOKEN_REQUIRED");
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not defined");

    try {
        const decoded = jwt.verify(token, secret) as DecodedToken;

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                name: true,
                email: true,
                photo: true,
                bio: true,
                role: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new AppError("User not found", 404, "AUTH_USER_NOT_FOUND");
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof AppError) throw error; // Re-throw AppErrors (like User not found)

        // Handle JWT specific errors here or let them bubble to global handler with specific keys
        throw new AppError("Invalid or expired token", 401, "AUTH_INVALID_TOKEN");
    }
});

export const adminMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.role === "ADMIN") {
        next();
        return;
    }
    throw new AppError("Only admins can do this!", 403, "AUTH_ADMIN_ONLY");
});

export const creatorMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (
        (req.user && req.user.role === "CREATOR") ||
        (req.user && req.user.role === "ADMIN")
    ) {
        next();
        return;
    }
    throw new AppError("Only creators can do this!", 403, "AUTH_CREATOR_ONLY");
});

export const verifiedMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.isVerified) {
        next();
        return;
    }
    throw new AppError("Please verify your email address!", 403, "AUTH_EMAIL_NOT_VERIFIED");
});

export const clearSession = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;
    if (token) {
        res.clearCookie("token", {
            httpOnly: true,
            sameSite: "none",
            secure: true,
            path: "/",
        });
    }
    next();
});
