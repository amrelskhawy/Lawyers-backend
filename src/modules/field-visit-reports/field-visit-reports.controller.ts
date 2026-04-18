import { Response } from "express";
import asyncHandler from "express-async-handler";
import { FieldVisitReportsService } from "./field-visit-reports.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const service = new FieldVisitReportsService();

export const listFieldVisitReportsByCase = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.listByCase(req.params.caseId as string);
        res.status(200).json(new AppResponse(true, "FIELD_VISIT_REPORTS_RETRIEVED_SUCCESS", data));
    },
);

export const getFieldVisitReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.getById(req.params.id as string);
        res.status(200).json(new AppResponse(true, "FIELD_VISIT_REPORT_RETRIEVED_SUCCESS", data));
    },
);

export const createFieldVisitReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.create(req.body.caseId, req.user.id);
        res.status(201).json(new AppResponse(true, "FIELD_VISIT_REPORT_CREATED_SUCCESS", data));
    },
);

export const updateFieldVisitReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.update(req.params.id as string, req.body);
        res.status(200).json(new AppResponse(true, "FIELD_VISIT_REPORT_UPDATED_SUCCESS", data));
    },
);

export const deleteFieldVisitReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const result = await service.remove(req.params.id as string);
        res.status(200).json(new AppResponse(true, result.message));
    },
);

export const generateFieldVisitReportPdf = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { data, regenerated } = await service.generateAndUploadPdf(req.params.id as string);
        const messageKey = regenerated
            ? "FIELD_VISIT_REPORT_PDF_GENERATED_SUCCESS"
            : "FIELD_VISIT_REPORT_PDF_UNCHANGED_USING_EXISTING";
        res.status(200).json(new AppResponse(true, messageKey, data));
    },
);

export const sendFieldVisitReportToClient = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { data } = await service.sendToClient(req.params.id as string);
        res.status(200).json(new AppResponse(true, "FIELD_VISIT_REPORT_SENT_TO_CLIENT_SUCCESS", data));
    },
);
