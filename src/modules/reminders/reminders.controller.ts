import { Response } from "express";
import asyncHandler from "express-async-handler";
import { ReminderService } from "./reminders.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import { INTERNAL_REMINDER_TYPES, REMINDER_TYPE_DESCRIPTIONS } from "./reminders.messages.js";

const reminderService = new ReminderService();

export const getReminderTypes = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const types = Object.entries(REMINDER_TYPE_DESCRIPTIONS)
        .filter(([value]) => !INTERNAL_REMINDER_TYPES.includes(value as any))
        .map(([value, description]) => ({ value, description }));
    res.status(200).json(new AppResponse(true, "REMINDER_TYPES_RETRIEVED", types));
});

export const listCaseReminders = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { caseId } = req.params as { caseId: string };
    const data = await reminderService.listByCase(caseId, req.user);
    res.status(200).json(new AppResponse(true, "REMINDERS_RETRIEVED", data));
});

export const createReminder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await reminderService.create(req.body, req.user);
    res.status(201).json(new AppResponse(true, "REMINDER_CREATED", data));
});

export const updateReminder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    const data = await reminderService.update(id, req.body, req.user);
    res.status(200).json(new AppResponse(true, "REMINDER_UPDATED", data));
});

export const deleteReminder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    const data = await reminderService.remove(id, req.user);
    res.status(200).json(new AppResponse(true, "REMINDER_DELETED", data));
});

export const sendMemoReminder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await reminderService.sendMemoReminderToConsultant(req.body, req.user);
    res.status(201).json(new AppResponse(true, "MEMO_REMINDER_SENT", data));
});

export const listConsultantReminders = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await reminderService.listConsultantReminders(req.user);
    res.status(200).json(new AppResponse(true, "CONSULTANT_REMINDERS_RETRIEVED", data));
});
