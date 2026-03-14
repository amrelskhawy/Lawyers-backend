import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppResponse } from '../../core/utils/AppResponse.js';

const ServiceBaseSchema = z.object({
    name: z.string().min(3).max(50).optional(),
    name_ar: z.string().min(3).max(50).optional(),
    name_en: z.string().min(3).max(50).optional(),
    description: z.string().max(500).optional(),
    description_ar: z.string().max(500).optional(),
    description_en: z.string().max(500).optional(),
    price: z.number().positive("Price must be a positive number"),
    isActive: z.boolean().optional(),
});

const serviceTransformation = (data: any) => {
    return {
        ...data,
        name_ar: data.name_ar || data.name || "",
        name_en: data.name_en || data.name || "",
        description_ar: data.description_ar || data.description,
        description_en: data.description_en || data.description,
    };
};

export const CreateServiceSchema = ServiceBaseSchema.transform(serviceTransformation);

export const UpdateServiceSchema = ServiceBaseSchema.partial().transform(serviceTransformation);

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
