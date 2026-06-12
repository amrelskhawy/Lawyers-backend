import { Response } from "express";
import asyncHandler from "express-async-handler";
import { SessionReportsService } from "./session-reports.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const reports = new SessionReportsService();

export const listSessionReportsByCase = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { data, meta } = await reports.listByCase(
            req.params.caseId as string,
            req.query,
        );
        res.status(200).json(
            new AppResponse(true, "SESSION_REPORTS_RETRIEVED_SUCCESS", data, 200, meta),
        );
    },
);

export const getSessionReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await reports.getById(req.params.id as string);
        res.status(200).json(
            new AppResponse(true, "SESSION_REPORT_RETRIEVED_SUCCESS", data),
        );
    },
);

export const createSessionReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await reports.create(req.body.caseId, req.user.id);
        res.status(201).json(
            new AppResponse(true, "SESSION_REPORT_CREATED_SUCCESS", data),
        );
    },
);

export const updateSessionReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await reports.update(req.params.id as string, req.body);
        res.status(200).json(
            new AppResponse(true, "SESSION_REPORT_UPDATED_SUCCESS", data),
        );
    },
);

export const deleteSessionReport = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const result = await reports.remove(req.params.id as string);
        res.status(200).json(new AppResponse(true, result.message));
    },
);

export const generateSessionReportPdf = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { data, regenerated } = await reports.generateAndUploadPdf(req.params.id as string);
        const messageKey = regenerated
            ? "SESSION_REPORT_PDF_GENERATED_SUCCESS"
            : "SESSION_REPORT_PDF_UNCHANGED_USING_EXISTING";
        res.status(200).json(new AppResponse(true, messageKey, data));
    },
);

export const sendSessionReportToClient = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { data } = await reports.sendToClient(req.params.id as string);
        res.status(200).json(
            new AppResponse(true, "SESSION_REPORT_SENT_TO_CLIENT_SUCCESS", data),
        );
    },
);
