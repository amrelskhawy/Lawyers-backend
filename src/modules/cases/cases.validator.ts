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

export const UpdateCaseSchema = z
    .object({
        customerId: z.string().uuid().optional(),
        caseType: CaseTypeEnum.optional(),
        otherCaseType: z.string().nullable().optional(),
        caseDate: isoDate.optional(),
        hijriDate: z.string().nullable().optional(),
        agencyNumber: z.string().nullable().optional(),

        wantsSpecificLawyer: z.boolean().optional(),
        preferredLawyerId: z.string().uuid().nullable().optional(),

        sessionReceiverId: z.string().uuid().nullable().optional(),
        sessionDate: isoDate.nullable().optional(),

        hasStructuredNotes: z.boolean().optional(),
        weaknesses: z.array(z.string()).optional(),
        strengths: z.array(z.string()).optional(),
        gaps: z.array(z.string()).optional(),
        freeNotes: z.string().nullable().optional(),
    })
    .strict();

export type CreateCasePayload = z.infer<typeof CreateCaseSchema>;
export type UpdateCasePayload = z.infer<typeof UpdateCaseSchema>;

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
