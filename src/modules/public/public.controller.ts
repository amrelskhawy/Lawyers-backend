import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { format } from "date-fns";


export const getPublicData = asyncHandler(async (req: Request, res: Response) => {
    const [services, holidays, workingDays] = await Promise.all([
        // Fetch all active services
        prisma.service.findMany({
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                description: true,
                price: true,
            }
        }),

        // Fetch all future holidays (no need to show past holidays on landing page)
        prisma.holiday.findMany({
            where: {
                date: {
                    gte: new Date() // Only future holidays
                }
            },
            orderBy: { date: "asc" },
            select: {
                id: true,
                date: true,
                name: true,
                startTime: true,
                endTime: true,
                isFullDay: true,
            }
        }),

        // Fetch working days configuration
        prisma.workingDay.findMany({
            orderBy: { day: "asc" },
            select: {
                id: true,
                day: true,
                isOpen: true,
                startTime: true,
                endTime: true,
            }
        })
    ]);

    // Format holidays dates to YYYY-MM-DD
    const formattedHolidays = holidays.map(h => ({
        ...h,
        date: format(h.date, "yyyy-MM-dd")
    }));

    // If no working days configured, return default schedule
    const activeWorkingDays = workingDays.length > 0 ? workingDays : [
        {
            id: "default",
            day: "DEFAULT",
            isOpen: true,
            startTime: "00:00",
            endTime: "23:59"
        }
    ];

    res.status(200).json(new AppResponse(
        true,
        "Public data retrieved successfully",
        {
            services,
            holidays: formattedHolidays,
            workingDays: activeWorkingDays,
        }
    ));
});