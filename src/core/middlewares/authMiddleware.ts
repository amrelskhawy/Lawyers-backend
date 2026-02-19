import { Request, Response, NextFunction } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import prisma from "../db/prisma.js";
import { AppResponse } from "../utils/AppResponse.js";

interface DecodedToken {
    id: string;
}

export interface AuthRequest extends Request {
    user?: any;
}

export const protect = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    // 1. Check Authorization Header (Bearer Token)
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }
    // 2. Check Cookies
    else if (req.cookies.token) {
        token = req.cookies.token;
    }
    // 3. Check Custom Header (commonly used in API testing)
    else if (req.headers.token) {
        token = req.headers.token as string;
    }

    if (!token) {
        throw new AppResponse(false, "AUTH_TOKEN_REQUIRED", null, 401);
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
                role: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new AppResponse(false, "AUTH_USER_NOT_FOUND", null, 404);
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof AppResponse) throw error; // Re-throw AppResponses (like User not found)

        // Handle JWT specific errors here or let them bubble to global handler with specific keys
        throw new AppResponse(false, "AUTH_INVALID_TOKEN", null, 401);
    }
});

export const adminMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.role === "ADMIN") {
        next();
        return;
    }
    throw new AppResponse(false, "AUTH_ADMIN_ONLY", null, 403);
});

export const moderatorMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (
        (req.user && req.user.role === "MODERATOR") ||
        (req.user && req.user.role === "ADMIN")
    ) {
        next();
        return;
    }
    throw new AppResponse(false, "AUTH_MODERATOR_ONLY", null, 403);
});

export const verifiedMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.isVerified) {
        next();
        return;
    }
    throw new AppResponse(false, "AUTH_EMAIL_NOT_VERIFIED", null, 403);
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
