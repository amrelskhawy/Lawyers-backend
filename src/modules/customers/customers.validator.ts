import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppResponse } from '../../core/utils/AppResponse.js';

const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CustomerBaseObject = z.object({
    fullName: z.string().min(2, "Full name must be at least 2 characters").max(100),
    email: z.string().regex(emailRegex, "Invalid email format").optional().nullable(),
    phone: z.string().regex(phoneRegex, "Invalid phone number format"),
    location: z.string().max(255).optional(),
});

export const CreateCustomerSchema = CustomerBaseObject;

export const UpdateCustomerSchema = CustomerBaseObject.partial();

export type CreateCustomerPayload = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerPayload = z.infer<typeof UpdateCustomerSchema>;

export const validateCreateCustomer = (req: Request, res: Response, next: NextFunction) => {
    const result = CreateCustomerSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateCustomer = (req: Request, res: Response, next: NextFunction) => {
    const result = UpdateCustomerSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
