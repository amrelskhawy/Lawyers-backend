import { Response } from "express";
import asyncHandler from "express-async-handler";
import { CasesService } from "./cases.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const cases = new CasesService();

export const listCases = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await cases.list();
    res.status(200).json(new AppResponse(true, "CASES_RETRIEVED_SUCCESS", data));
});

export const listLawyers = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await cases.listLawyers();
    res.status(200).json(new AppResponse(true, "LAWYERS_RETRIEVED_SUCCESS", data));
});

export const getCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.getById(req.params.id as string);
    res.status(200).json(new AppResponse(true, "CASE_RETRIEVED_SUCCESS", data));
});

export const createCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.create(req.body, req.user.id);
    res.status(201).json(new AppResponse(true, "CASE_CREATED_SUCCESS", data));
});

export const updateCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.update(req.params.id as string, req.body);
    res.status(200).json(new AppResponse(true, "CASE_UPDATED_SUCCESS", data));
});

export const deleteCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await cases.remove(req.params.id as string);
    res.status(200).json(new AppResponse(true, result.message));
});

export const generateCasePdf = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.generateAndUploadPdf(req.params.id as string);
    res.status(200).json(new AppResponse(true, "CASE_PDF_GENERATED_SUCCESS", data));
});

export const sendCaseToClient = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.sendToClient(req.params.id as string);
    res.status(200).json(new AppResponse(true, "CASE_SENT_TO_CLIENT_SUCCESS", data));
});
