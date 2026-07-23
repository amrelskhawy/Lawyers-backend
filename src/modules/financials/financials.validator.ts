import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppResponse } from "../../core/utils/AppResponse.js";

/**
 * Query for every financials endpoint. `scope` picks the money bucket:
 * COMPANY = clients that came through the company, LAWYER = clients a lawyer
 * brought in (optionally narrowed to one lawyer).
 */
export const FinancialsQuerySchema = z.object({
    scope: z.enum(["COMPANY", "LAWYER"]).default("COMPANY"),
    sourceLawyerId: z.string().uuid().optional(),
    year: z.coerce.number().int().min(1900).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    search: z.string().optional(),
});

export type FinancialsQuery = z.infer<typeof FinancialsQuerySchema>;

export const validateFinancialsQuery = (req: Request, res: Response, next: NextFunction) => {
    const result = FinancialsQuerySchema.safeParse(req.query);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    // Kept off `req.query` so the raw query stays intact for the paginator.
    res.locals.financialsQuery = result.data;
    next();
};
