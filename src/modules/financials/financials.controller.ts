import { Response } from "express";
import asyncHandler from "express-async-handler";
import { FinancialsService } from "./financials.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { FinancialsQuery } from "./financials.validator.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const service = new FinancialsService();

const parsedQuery = (res: Response): FinancialsQuery => res.locals.financialsQuery;

export const getFinancialsSummary = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await service.summary(parsedQuery(res));
    res.status(200).json(new AppResponse(true, "FINANCIALS_SUMMARY_RETRIEVED_SUCCESS", data));
});

export const getFinancialsContracts = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { data, meta } = await service.contracts(parsedQuery(res), req.query);
    res.status(200).json(
        new AppResponse(true, "FINANCIALS_CONTRACTS_RETRIEVED_SUCCESS", data, 200, meta),
    );
});

export const getFinancialsYears = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await service.availableYears();
    res.status(200).json(new AppResponse(true, "FINANCIALS_YEARS_RETRIEVED_SUCCESS", data));
});
