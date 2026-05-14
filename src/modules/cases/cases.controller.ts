import { Response } from "express";
import asyncHandler from "express-async-handler";
import { CasesService } from "./cases.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const cases = new CasesService();

export const listCases = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.list(req.user);
    res.status(200).json(new AppResponse(true, "CASES_RETRIEVED_SUCCESS", data));
});

export const listLawyers = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await cases.listLawyers();
    res.status(200).json(new AppResponse(true, "LAWYERS_RETRIEVED_SUCCESS", data));
});

export const getCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.getById(req.params.id as string, req.user);
    res.status(200).json(new AppResponse(true, "CASE_RETRIEVED_SUCCESS", data));
});

export const createCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.create(req.body, req.user.id);
    res.status(201).json(new AppResponse(true, "CASE_CREATED_SUCCESS", data));
});

export const updateCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.update(req.params.id as string, req.body, req.user.id, req.user.role);
    res.status(200).json(new AppResponse(true, "CASE_UPDATED_SUCCESS", data));
});

export const deleteCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await cases.remove(req.params.id as string);
    res.status(200).json(new AppResponse(true, result.message));
});

export const assignCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.assign(req.params.id as string, req.body, req.user.id);
    res.status(200).json(new AppResponse(true, "CASE_ASSIGNED_SUCCESS", data));
});

export const acceptCaseAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.acceptAssignment(req.params.id as string, req.user.id);
    res.status(200).json(new AppResponse(true, "CASE_ASSIGNMENT_ACCEPTED", data));
});

export const rejectCaseAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.rejectAssignment(req.params.id as string, req.user.id);
    res.status(200).json(new AppResponse(true, "CASE_ASSIGNMENT_REJECTED", data));
});

export const generateCasePdf = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data, regenerated } = await cases.generateAndUploadPdf(req.params.id as string);
    const messageKey = regenerated
        ? "CASE_PDF_GENERATED_SUCCESS"
        : "CASE_PDF_UNCHANGED_USING_EXISTING";
    res.status(200).json(new AppResponse(true, messageKey, data));
});

export const sendCaseToClient = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data } = await cases.sendToClient(req.params.id as string);
    res.status(200).json(new AppResponse(true, "CASE_SENT_TO_CLIENT_SUCCESS", data));
});
