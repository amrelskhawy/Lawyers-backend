import express from "express";
import { protect, requireRole } from "../../core/middlewares/authMiddleware.js";
import asyncHandler from "express-async-handler";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const router = express.Router();

router.get(
    "/",
    protect,
    requireRole("ADMIN"),
    asyncHandler(async (req, res) => {
        const { resource, userId, action, page = "1", limit = "50" } = req.query as Record<string, string>;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where: Record<string, any> = {};
        if (resource) where.resource = resource;
        if (userId) where.userId = userId;
        if (action) where.action = action;

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                include: { user: { select: { id: true, name: true, email: true, role: true } } },
                orderBy: { createdAt: "desc" },
                skip,
                take: parseInt(limit),
            }),
            prisma.activityLog.count({ where }),
        ]);

        res.status(200).json(
            new AppResponse(true, "ACTIVITY_LOGS_RETRIEVED", { logs, total, page: parseInt(page), limit: parseInt(limit) }),
        );
    }),
);

export default router;
