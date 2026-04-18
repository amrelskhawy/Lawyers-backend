import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppResponse } from "../../core/utils/AppResponse.js";

const isoDate = z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");

export const CreateFieldVisitReportSchema = z.object({
    caseId: z.string().uuid(),
});

export const UpdateFieldVisitReportSchema = z
    .object({
        reviewLawyer:  z.string().nullable().optional(),
        reviewPlace:   z.string().nullable().optional(),
        agencyNumber:  z.string().nullable().optional(),
        clientName:    z.string().nullable().optional(),
        caseNumber:    z.string().nullable().optional(),
        reviewDate:    isoDate.nullable().optional(),
        reportSummary: z.string().nullable().optional(),
    })
    .strict();

export type CreateFieldVisitReportPayload = z.infer<typeof CreateFieldVisitReportSchema>;
export type UpdateFieldVisitReportPayload = z.infer<typeof UpdateFieldVisitReportSchema>;

export const validateCreateFieldVisitReport = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const result = CreateFieldVisitReportSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateFieldVisitReport = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const result = UpdateFieldVisitReportSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
