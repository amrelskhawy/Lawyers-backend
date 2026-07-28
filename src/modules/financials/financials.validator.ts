import { Response, NextFunction } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

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

export type FinancialsQuery = z.infer<typeof FinancialsQuerySchema> & {
    /**
     * Set by the middleware, never by the client: the viewer may only ever see
     * money from the clients they personally sourced.
     */
    restrictedToSelf?: boolean;
};

/**
 * Roles that only ever see their own sourced money, never the company's —
 * every staff role except ADMIN/MODERATOR, who see everything.
 */
const SELF_SCOPED_ROLES: string[] = Object.values(Role).filter(
    (role) => role !== "ADMIN" && role !== "MODERATOR",
);

export const validateFinancialsQuery = (req: AuthRequest, res: Response, next: NextFunction) => {
    const result = FinancialsQuerySchema.safeParse(req.query);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }

    const query: FinancialsQuery = result.data;

    // A lawyer's scope comes from their token, not from the query string —
    // otherwise anyone could ask for `scope=COMPANY` or another lawyer's id and
    // read money that isn't theirs.
    if (SELF_SCOPED_ROLES.includes(req.user?.role)) {
        query.scope = "LAWYER";
        query.sourceLawyerId = req.user.id;
        query.restrictedToSelf = true;
    }

    // Kept off `req.query` so the raw query stays intact for the paginator.
    res.locals.financialsQuery = query;
    next();
};
