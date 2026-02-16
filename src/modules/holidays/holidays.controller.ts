import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { HolidaysService } from "./holidays.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AppError } from "../../core/utils/AppError.js";

const holidaysService = new HolidaysService();

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
    const { date, name, startTime, endTime, isFullDay } = req.body;

    if (!date || !name) {
        throw new AppError("Date and name are required", 400, "HOLIDAY_DETAILS_MISSING");
    }

    const holiday = await holidaysService.createHoliday({ date, name, startTime, endTime, isFullDay });
    res.status(201).json(new AppResponse(true, "HOLIDAY_CREATED_SUCCESS", holiday));
});

export const getHolidaysInRange = asyncHandler(async (req: Request, res: Response) => {
    const { from, to } = req.query;

    if (!from || !to) {
        throw new AppError("From and to dates are required", 400, "DATE_RANGE_REQUIRED");
    }

    const holidays = await holidaysService.getHolidaysByRange(new Date(from as string), new Date(to as string));
    res.status(200).json(new AppResponse(true, "HOLIDAYS_RETRIEVED_FOR_RANGE", holidays));
});

export const getHolidays = asyncHandler(async (req: Request, res: Response) => {
    const holidays = await holidaysService.getHolidays();
    res.status(200).json(new AppResponse(true, "HOLIDAYS_RETRIEVED", holidays));
});

export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await holidaysService.deleteHoliday(id as string);
    res.status(200).json(new AppResponse(true, "HOLIDAY_DELETED_SUCCESS"));
});
