import { Request, Response } from "express";
import asyncHandler from "express-async-handler"
import { DaysService } from "./workday.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const workingDayService = new DaysService();

export const createWorkingDays = asyncHandler(async (req: Request, res: Response) => {
  const workingDays = await workingDayService.createWorkingDays();
  res.status(200).json(new AppResponse(true, "WORKING_DAYS_CREATED_SUCCESS", workingDays));
});

export const getAllWorkingDays = asyncHandler(async (req: Request, res: Response) => {
  const workingDays = await workingDayService.getWorkingDays();
  res.status(200).json(new AppResponse(true, "WORKING_DAYS_FETCHED_SUCCESS", workingDays));
});

export const updateWorkingDays = asyncHandler(async (req: Request, res: Response) => {
  const workingDays = await workingDayService.updateWorkingDays(req.body.data);
  res.status(200).json(new AppResponse(true, "WORKING_DAY_UPDATED_SUCCESS", workingDays));
});