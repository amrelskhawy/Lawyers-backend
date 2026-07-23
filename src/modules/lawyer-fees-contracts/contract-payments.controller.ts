import { Response } from "express";
import asyncHandler from "express-async-handler";
import { ContractPaymentsService } from "./contract-payments.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const service = new ContractPaymentsService();

export const listContractPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await service.listForContract(req.params.id as string);
    res.status(200).json(new AppResponse(true, "CONTRACT_PAYMENTS_RETRIEVED_SUCCESS", data));
});

export const listCaseContractPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await service.listForCase(req.params.caseId as string);
    res.status(200).json(new AppResponse(true, "CONTRACT_PAYMENTS_RETRIEVED_SUCCESS", data));
});

export const createContractPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await service.create(req.params.id as string, req.body, req.user.id);
    res.status(201).json(new AppResponse(true, "CONTRACT_PAYMENT_CREATED_SUCCESS", data));
});

export const updateContractPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await service.update(
        req.params.id as string,
        req.params.paymentId as string,
        req.body,
    );
    res.status(200).json(new AppResponse(true, "CONTRACT_PAYMENT_UPDATED_SUCCESS", data));
});

export const deleteContractPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await service.remove(req.params.id as string, req.params.paymentId as string);
    res.status(200).json(new AppResponse(true, "CONTRACT_PAYMENT_DELETED_SUCCESS", data));
});
