import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { format } from "date-fns";

export const getPublicData = asyncHandler(
  async (req: Request, res: Response) => {
    const [services, holidays, workingDays] = await Promise.all([
      // Fetch all active, non-free services
      prisma.service.findMany({
        where: { isActive: true, isFree: false },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name_ar: true,
          name_en: true,
          description_ar: true,
          description_en: true,
          price: true,
          isInstallmentPlans: true,
        },
      }),

      // Fetch all future holidays (no need to show past holidays on landing page)
      prisma.holiday.findMany({
        where: {
          date: {
            gte: new Date(), // Only future holidays
          },
        },
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          name: true,
          startTime: true,
          endTime: true,
          isFullDay: true,
        },
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
        },
      }),
    ]);

    // Format holidays dates to YYYY-MM-DD
    const formattedHolidays = holidays.map((h) => ({
      ...h,
      date: format(h.date, "yyyy-MM-dd"),
    }));

    // If no working days configured, return default schedule
    const activeWorkingDays =
      workingDays.length > 0
        ? workingDays
        : [
            {
              id: "default",
              day: "DEFAULT",
              isOpen: true,
              startTime: "00:00",
              endTime: "23:59",
            },
          ];

    res.status(200).json(
      new AppResponse(true, "PUBLIC_DATA_RETRIEVED_SUCCESS", {
        services,
        holidays: formattedHolidays,
        workingDays: activeWorkingDays,
      }),
    );
  },
);


export const getLawyers = asyncHandler(
  async (req: Request, res: Response) => {
    const lawyers = await prisma.user.findMany({
      where: { role: "LAWYER" },
      select: {
        id: true,
        name: true,
        email: true,
        picture: true,
      },
    });
    res.status(200).json(new AppResponse(true, "LAWYERS_RETRIEVED_SUCCESS", lawyers));
  },
);