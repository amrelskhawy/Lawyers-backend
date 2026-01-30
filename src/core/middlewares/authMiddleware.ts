import { Request, Response, NextFunction } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import prisma from "../db/prisma.js";

interface DecodedToken {
    id: string;
}

export interface AuthRequest extends Request {
    user?: any;
}

export const protect = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            res.status(401).json({ message: "Not authorized, please login!" });
            return;
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET not defined");

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
            res.status(404).json({ message: "User not found!" });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: "Not authorized, token failed!" });
    }
});

export const adminMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.role === "ADMIN") {
        next();
        return;
    }
    res.status(403).json({ message: "Only admins can do this!" });
});

export const creatorMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (
        (req.user && req.user.role === "CREATOR") ||
        (req.user && req.user.role === "ADMIN")
    ) {
        next();
        return;
    }
    res.status(403).json({ message: "Only creators can do this!" });
});

export const verifiedMiddleware = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && req.user.isVerified) {
        next();
        return;
    }
    res.status(403).json({ message: "Please verify your email address!" });
});
