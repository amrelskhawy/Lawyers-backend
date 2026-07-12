import { Response } from "express";
import asyncHandler from "express-async-handler";
import { CasesService } from "./cases.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const cases = new CasesService();

export const listCases = asyncHandler(async (req: AuthRequest, res: Response) => {
    // Optional `?month=iYYYY-iMM` switches to the (unpaginated) calendar window.
    let hijriYear: number | undefined;
    let hijriMonth: number | undefined;
    const month = req.query.month;
    if (typeof month === "string") {
        const m = month.trim().match(/^(\d{3,4})-(\d{1,2})$/);
        if (!m) {
            throw new AppResponse(false, "INVALID_MONTH_PARAM", null, 400);
        }
        hijriYear = Number(m[1]);
        hijriMonth = Number(m[2]);
        if (hijriMonth < 1 || hijriMonth > 12) {
            throw new AppResponse(false, "INVALID_MONTH_PARAM", null, 400);
        }
    }

    const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

    // Optional `?from=iYYYY-iMM-iDD&to=iYYYY-iMM-iDD` (exclusive end) for the
    // day/week/month/year calendar views.
    const hijriDate = /^\d{3,4}-\d{1,2}-\d{1,2}$/;
    const from = asStr(req.query.from);
    const to = asStr(req.query.to);
    if ((from && !hijriDate.test(from)) || (to && !hijriDate.test(to))) {
        throw new AppResponse(false, "INVALID_DATE_RANGE", null, 400);
    }

    const { data, meta } = await cases.list(req.user, {
        hijriYear,
        hijriMonth,
        fromHijri: from && to ? from : undefined,
        toHijri: from && to ? to : undefined,
        query: req.query,
        search: asStr(req.query.search),
        caseType: asStr(req.query.caseType) as never,
        caseDegree: asStr(req.query.caseDegree) as never,
        lawyerId: asStr(req.query.lawyerId),
        onlyClosed: req.query.onlyClosed === "true",
    });
    res.status(200).json(new AppResponse(true, "CASES_RETRIEVED_SUCCESS", data, 200, meta));
});

export const listUnscheduledCases = asyncHandler(async (req: AuthRequest, res: Response) => {
    // Cases with no session date/time set yet — for staff to find and schedule.
    const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

    const { data, meta } = await cases.listUnscheduled(req.user, {
        query: req.query,
        search: asStr(req.query.search),
        caseType: asStr(req.query.caseType) as never,
        caseDegree: asStr(req.query.caseDegree) as never,
        lawyerId: asStr(req.query.lawyerId),
    });
    res.status(200).json(new AppResponse(true, "CASES_RETRIEVED_SUCCESS", data, 200, meta));
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
    const data = await cases.acceptAssignment(req.params.id as string, req.user.id, req.user.role);
    res.status(200).json(new AppResponse(true, "CASE_ASSIGNMENT_ACCEPTED", data));
});

export const rejectCaseAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.rejectAssignment(
        req.params.id as string,
        req.user.id,
        req.body.reason,
        req.user.role,
    );
    res.status(200).json(new AppResponse(true, "CASE_ASSIGNMENT_REJECTED", data));
});

export const unassignCase = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.unassign(req.params.id as string, req.user.id, req.body.kind);
    res.status(200).json(new AppResponse(true, "CASE_UNASSIGNED_SUCCESS", data));
});

export const setCaseSessionDate = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.setSessionDate(
        req.params.id as string,
        req.body,
        req.user.id,
        req.user.role,
    );
    res.status(200).json(new AppResponse(true, "CASE_SESSION_DATE_SET_SUCCESS", data));
});

export const setCaseCompletion = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.setCompletion(
        req.params.id as string,
        req.body.completed as boolean,
        req.user.id,
        req.user.role,
    );
    const messageKey = req.body.completed ? "CASE_COMPLETED_SUCCESS" : "CASE_REOPENED_SUCCESS";
    res.status(200).json(new AppResponse(true, messageKey, data));
});

export const setCaseDegree = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.setDegree(
        req.params.id as string,
        req.body,
        req.user.id,
        req.user.role,
    );
    res.status(200).json(new AppResponse(true, "CASE_DEGREE_SET_SUCCESS", data));
});

export const setCaseCourtInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await cases.setCourtInfo(
        req.params.id as string,
        req.body,
        req.user.id,
        req.user.role,
    );
    res.status(200).json(new AppResponse(true, "CASE_COURT_INFO_SET_SUCCESS", data));
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
