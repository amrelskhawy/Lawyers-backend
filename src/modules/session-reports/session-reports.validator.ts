import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppResponse } from "../../core/utils/AppResponse.js";

const isoDate = z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");

export const CreateSessionReportSchema = z.object({
    caseId: z.string().uuid(),
});

export const UpdateSessionReportSchema = z
    .object({
        sessionDate: isoDate.nullable().optional(),
        sessionTitle: z.string().nullable().optional(),
        sessionSummary: z.string().nullable().optional(),
        courtDecision: z.string().nullable().optional(),
        lawyerNotes: z.string().nullable().optional(),
        nextSessionDate: isoDate.nullable().optional(),

        reportNumber: z.string().nullable().optional(),
        courtName: z.string().nullable().optional(),
        courtCircuit: z.string().nullable().optional(),
        caseCharge: z.string().nullable().optional(),
        opponentName: z.string().nullable().optional(),
        caseNumber: z.string().nullable().optional(),
        caseData: z.string().nullable().optional(),
        sessionOrdinal: z.string().nullable().optional(),
        attendanceOrdinal: z.string().nullable().optional(),
        sessionTime: z.string().nullable().optional(),
        hijriDate: z.string().nullable().optional(),
        closingNote: z.string().nullable().optional(),
    })
    .strict();

export type CreateSessionReportPayload = z.infer<typeof CreateSessionReportSchema>;
export type UpdateSessionReportPayload = z.infer<typeof UpdateSessionReportSchema>;

export const validateCreateSessionReport = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const result = CreateSessionReportSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateSessionReport = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const result = UpdateSessionReportSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
