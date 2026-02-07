import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { HolidaysService } from "./holidays.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AppError } from "../../core/utils/AppError.js";

const holidaysService = new HolidaysService();

export const createHoliday = asyncHandler(async (req: Request, res: Response) => {
    const { date, name } = req.body;

    if (!date || !name) {
        throw new AppError("Date and name are required", 400, "HOLIDAY_DETAILS_MISSING");
    }

    const holiday = await holidaysService.createHoliday({ date, name });
    res.status(201).json(new AppResponse(true, "Holiday created successfully", holiday));
});

export const getHolidays = asyncHandler(async (req: Request, res: Response) => {
    const holidays = await holidaysService.getHolidays();
    res.status(200).json(new AppResponse(true, "Holidays retrieved", holidays));
});

export const deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await holidaysService.deleteHoliday(id);
    res.status(200).json(new AppResponse(true, "Holiday deleted successfully", null));
});
