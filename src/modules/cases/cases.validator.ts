import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppResponse } from "../../core/utils/AppResponse.js";

const CaseTypeEnum = z.enum([
    "CRIMINAL",
    "ADMINISTRATIVE",
    "LABOR",
    "COMMERCIAL",
    "PENAL",
    "GENERAL",
    "PERSONAL_STATUS",
    "OTHER",
]);

const isoDate = z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");

export const CreateCaseSchema = z.object({
    customerId: z.string().uuid(),
    caseType: CaseTypeEnum,
    otherCaseType: z.string().optional(),
    caseDate: isoDate,
    hijriDate: z.string().optional(),
    agencyNumber: z.string().optional(),
});

// General case update — assignment fields are excluded (use /assign endpoint)
export const UpdateCaseSchema = z
    .object({
        customerId: z.string().uuid().optional(),
        caseType: CaseTypeEnum.optional(),
        otherCaseType: z.string().nullable().optional(),
        caseDate: isoDate.optional(),
        hijriDate: z.string().nullable().optional(),
        agencyNumber: z.string().nullable().optional(),

        sessionReceiverId: z.string().uuid().nullable().optional(),
        sessionReceiverName: z.string().nullable().optional(),

        hasStructuredNotes: z.boolean().optional(),
        weaknesses: z.array(z.string()).optional(),
        strengths: z.array(z.string()).optional(),
        gaps: z.array(z.string()).optional(),
        freeNotes: z.string().nullable().optional(),
    })
    .strict();

// Assignment — only staff (admin/moderator/receptionist) can send this
export const AssignCaseSchema = z.object({
    lawyerId: z.string().uuid(),
    lawyerName: z.string().optional(),
}).strict();

// Assignment rejection — the assigned lawyer must give a reason
export const RejectAssignmentSchema = z.object({
    reason: z.string().trim().min(1, "Rejection reason is required"),
}).strict();

// Setting the (Hijri) session date — triggers auto-scheduling of the 3 reminders.
// `sessionHijriDate` is iYYYY-iMM-iDD (e.g. "1447-12-15"); `sessionTime` is HH:mm.
export const SetSessionDateSchema = z.object({
    sessionHijriDate: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "Expected Hijri date as iYYYY-iMM-iDD"),
    sessionTime: z
        .string()
        .trim()
        .regex(/^\d{1,2}:\d{2}$/, "Expected time as HH:mm"),
}).strict();

// Toggling the "fully completed" state of a case.
export const SetCompletionSchema = z.object({
    completed: z.boolean(),
}).strict();

export type CreateCasePayload = z.infer<typeof CreateCaseSchema>;
export type UpdateCasePayload = z.infer<typeof UpdateCaseSchema>;
export type AssignCasePayload = z.infer<typeof AssignCaseSchema>;
export type RejectAssignmentPayload = z.infer<typeof RejectAssignmentSchema>;
export type SetSessionDatePayload = z.infer<typeof SetSessionDateSchema>;

export const validateCreateCase = (req: Request, res: Response, next: NextFunction) => {
    const result = CreateCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateCase = (req: Request, res: Response, next: NextFunction) => {
    const result = UpdateCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateAssignCase = (req: Request, res: Response, next: NextFunction) => {
    const result = AssignCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateRejectAssignment = (req: Request, res: Response, next: NextFunction) => {
    const result = RejectAssignmentSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetSessionDate = (req: Request, res: Response, next: NextFunction) => {
    const result = SetSessionDateSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetCompletion = (req: Request, res: Response, next: NextFunction) => {
    const result = SetCompletionSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
