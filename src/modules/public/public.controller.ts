import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { format } from "date-fns";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_BY_SLUG } from "../../core/constants/service-categories.js";

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


/**
 * The 8 fixed category cards for the homepage grid, each with a live count of
 * its published (active) services so a category with nothing to show yet can
 * still render honestly instead of implying it is fully stocked.
 */
export const getServiceCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const counts = await prisma.service.groupBy({
      by: ["categoryId"],
      where: { isActive: true, categoryId: { not: null } },
      _count: { _all: true },
    });
    const countByCategory = new Map(counts.map((c) => [c.categoryId, c._count._all]));

    const categories = SERVICE_CATEGORIES.map((category) => ({
      ...category,
      serviceCount: countByCategory.get(category.id) ?? 0,
    }));

    res
      .status(200)
      .json(new AppResponse(true, "SERVICE_CATEGORIES_RETRIEVED_SUCCESS", categories));
  },
);

/** One category's page: its own metadata plus every published service filed under it. */
export const getServiceCategoryBySlug = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = req.params.slug as string;
    const category = SERVICE_CATEGORY_BY_SLUG.get(slug);

    if (!category) {
      throw new AppResponse(false, "SERVICE_CATEGORY_NOT_FOUND", null, 404);
    }

    const services = await prisma.service.findMany({
      where: { categoryId: category.id, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name_ar: true,
        name_en: true,
        description_ar: true,
        description_en: true,
        price: true,
        isFree: true,
        isInstallmentPlans: true,
      },
    });

    res
      .status(200)
      .json(new AppResponse(true, "SERVICE_CATEGORY_RETRIEVED_SUCCESS", { ...category, services }));
  },
);

export const getLawyers = asyncHandler(
  async (req: Request, res: Response) => {
    const lawyers = await prisma.user.findMany({
      where: { role: { in: ["LAWYER", "CONSULTANT"] } },
      select: {
        id: true,
        name: true,
        email: true,
        picture: true,
        role: true,
      },
    });
    res.status(200).json(new AppResponse(true, "LAWYERS_RETRIEVED_SUCCESS", lawyers));
  },
);