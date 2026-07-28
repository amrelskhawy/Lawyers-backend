import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ConsultingService } from "./consulting.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const consultingService = new ConsultingService();

export const listConsultingRecords = asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await consultingService.listConsultingRecords(req.query);
    res.status(200).json(new AppResponse(true, "CONSULTING_RECORDS_RETRIEVED_SUCCESS", data, 200, meta));
});

export const getConsultingRecord = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const record = await consultingService.getConsultingRecordById(id);
    res.status(200).json(new AppResponse(true, "CONSULTING_RECORD_RETRIEVED_SUCCESS", record));
});

export const createConsultingRecord = asyncHandler(async (req: AuthRequest, res: Response) => {
    const record = await consultingService.createConsultingRecord(req.body, req.user!.id);
    res.status(201).json(new AppResponse(true, "CONSULTING_RECORD_CREATED_SUCCESS", record));
});

export const updateConsultingRecord = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const record = await consultingService.updateConsultingRecord(id, req.body, req.user!.id);
    res.status(200).json(new AppResponse(true, "CONSULTING_RECORD_UPDATED_SUCCESS", record));
});

export const deleteConsultingRecord = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await consultingService.deleteConsultingRecord(id);
    res.status(200).json(new AppResponse(true, result.message));
});

export const deleteMultipleConsultingRecords = asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    const result = await consultingService.deleteMultipleConsultingRecords(ids);
    res.status(200).json(new AppResponse(true, "CONSULTING_RECORDS_DELETED_SUCCESS", result));
});
