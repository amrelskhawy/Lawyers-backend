import { Request, Response } from "express";
import asyncHandler from "express-async-handler"
import { DaysService } from "./workday.service.js";
import { AppResponse } from "@app/core/utils/AppResponse.js";

const workingDayService = new DaysService();

export const createWorkingDays = asyncHandler(async (req: Request, res: Response) => {
  const workingDays = await workingDayService.createWorkingDays();
  res.status(200).json(new AppResponse(true, "Working days created successfully", workingDays));
});

export const getAllWorkingDays = asyncHandler(async (req: Request, res: Response) => {
  const workingDays = await workingDayService.getWorkingDays();
  res.status(200).json(new AppResponse(true, "Working days fetched successfully", workingDays));
});

export const updateWorkingDays = asyncHandler(async (req: Request, res: Response) => {
  const workingDays = await workingDayService.updateWorkingDays(req.body.data);
  res.status(200).json(new AppResponse(true, "Working day updated successfully", workingDays));
});