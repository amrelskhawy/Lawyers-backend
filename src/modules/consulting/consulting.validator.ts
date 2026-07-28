import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppResponse } from '../../core/utils/AppResponse.js';

const ConsultingBaseObject = z.object({
    customerId: z.string().uuid("Invalid customer"),
    date: z.coerce.date(),
    value: z.number().min(0, "Value must be a non-negative number"),
    type: z.string().min(1).max(150),
});

export const CreateConsultingSchema = ConsultingBaseObject;
export const UpdateConsultingSchema = ConsultingBaseObject.partial();

export type CreateConsultingPayload = z.output<typeof CreateConsultingSchema>;
export type UpdateConsultingPayload = z.output<typeof UpdateConsultingSchema>;

export const validateCreateConsulting = (req: Request, res: Response, next: NextFunction) => {
    const result = CreateConsultingSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateConsulting = (req: Request, res: Response, next: NextFunction) => {
    const result = UpdateConsultingSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
