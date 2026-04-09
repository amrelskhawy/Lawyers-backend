import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppResponse } from '../../core/utils/AppResponse.js';

const ServiceBaseObject = z.object({
    name: z.string().min(3).max(50).optional(),
    name_ar: z.string().min(3).max(50).optional(),
    name_en: z.string().min(3).max(50).optional(),
    description: z.string().max(500).optional(),
    description_ar: z.string().max(500).optional(),
    description_en: z.string().max(500).optional(),
    price: z.number().min(0, "Price must be a non-negative number").optional(),
    isActive: z.boolean().optional(),
    isFree: z.boolean().optional(),
});

const priceRefinement = (data: any, ctx: z.RefinementCtx) => {
    if (!data.isFree && (data.price === undefined || data.price < 1)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Price must be at least 1 when the service is not free",
            path: ["price"],
        });
    }
};

const serviceTransformation = (data: any) => {
    return {
        ...data,
        name_ar: data.name_ar || data.name || "",
        name_en: data.name_en || data.name || "",
        description_ar: data.description_ar || data.description,
        description_en: data.description_en || data.description,
    };
};

export const CreateServiceSchema = ServiceBaseObject
    .superRefine(priceRefinement)
    .transform(serviceTransformation);

export const UpdateServiceSchema = ServiceBaseObject
    .partial()
    .superRefine(priceRefinement)
    .transform(serviceTransformation);

export type CreateServicePayload = z.output<typeof CreateServiceSchema>;
export type UpdateServicePayload = z.output<typeof UpdateServiceSchema>;

export const validateCreateService = (req: Request, res: Response, next: NextFunction) => {
    const result = CreateServiceSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateService = (req: Request, res: Response, next: NextFunction) => {
    const result = UpdateServiceSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
