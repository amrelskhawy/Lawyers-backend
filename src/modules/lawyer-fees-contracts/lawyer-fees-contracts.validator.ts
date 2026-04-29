import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppResponse } from "../../core/utils/AppResponse.js";

const isoDate = z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");

const decimalLike = z.union([z.number(), z.string()]).refine(
    (v) => v === "" || !Number.isNaN(Number(v)),
    "Invalid number",
);

export const CreateLawyerFeesContractSchema = z
    .object({
        customerId: z.string().uuid().nullable().optional(),
        caseId:     z.string().uuid().nullable().optional(),
    })
    .strict();

export const UpdateLawyerFeesContractSchema = z
    .object({
        customerId:     z.string().uuid().nullable().optional(),
        caseId:         z.string().uuid().nullable().optional(),

        contractNumber: z.string().nullable().optional(),
        contractDay:    z.string().nullable().optional(),
        contractDate:   isoDate.nullable().optional(),
        hijriDate:      z.string().nullable().optional(),

        clientName:     z.string().nullable().optional(),
        clientIdNumber: z.string().nullable().optional(),
        clientPhone:    z.string().nullable().optional(),

        serviceDescription: z.string().nullable().optional(),

        totalFees:         decimalLike.nullable().optional(),
        firstInstallment:  decimalLike.nullable().optional(),
        secondInstallment: decimalLike.nullable().optional(),
        currency:          z.string().nullable().optional(),

        // Signature fields are accepted now but only meaningful once the
        // online-signature flow is wired up.
        firstPartySignature:  z.string().nullable().optional(),
        firstPartySignedAt:   isoDate.nullable().optional(),
        secondPartySignature: z.string().nullable().optional(),
        secondPartySignedAt:  isoDate.nullable().optional(),
    })
    .strict();

export type CreateLawyerFeesContractPayload = z.infer<typeof CreateLawyerFeesContractSchema>;
export type UpdateLawyerFeesContractPayload = z.infer<typeof UpdateLawyerFeesContractSchema>;

export const validateCreateLawyerFeesContract = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const result = CreateLawyerFeesContractSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateLawyerFeesContract = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const result = UpdateLawyerFeesContractSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
