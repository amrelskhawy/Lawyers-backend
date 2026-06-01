import { Request, Response, NextFunction } from "express";
import { CreateReminderSchema, UpdateReminderSchema } from "./reminders.types.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

export const validateCreateReminder = (req: Request, res: Response, next: NextFunction) => {
    const result = CreateReminderSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateReminder = (req: Request, res: Response, next: NextFunction) => {
    const result = UpdateReminderSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
