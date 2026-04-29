import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { LawyerFeesContractsService } from "./lawyer-fees-contracts.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import type { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const service = new LawyerFeesContractsService();

export const listLawyerFeesContracts = asyncHandler(
    async (_req: AuthRequest, res: Response) => {
        const data = await service.list();
        res.status(200).json(new AppResponse(true, "LAWYER_FEES_CONTRACTS_RETRIEVED_SUCCESS", data));
    },
);

export const listLawyerFeesContractsByCase = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.listByCase(req.params.caseId as string);
        res.status(200).json(new AppResponse(true, "LAWYER_FEES_CONTRACTS_RETRIEVED_SUCCESS", data));
    },
);

export const listLawyerFeesContractsByCustomer = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.listByCustomer(req.params.customerId as string);
        res.status(200).json(new AppResponse(true, "LAWYER_FEES_CONTRACTS_RETRIEVED_SUCCESS", data));
    },
);

export const getLawyerFeesContract = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.getById(req.params.id as string);
        res.status(200).json(new AppResponse(true, "LAWYER_FEES_CONTRACT_RETRIEVED_SUCCESS", data));
    },
);

export const createLawyerFeesContract = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.create(req.body, req.user.id);
        res.status(201).json(new AppResponse(true, "LAWYER_FEES_CONTRACT_CREATED_SUCCESS", data));
    },
);

export const updateLawyerFeesContract = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.update(req.params.id as string, req.body);
        res.status(200).json(new AppResponse(true, "LAWYER_FEES_CONTRACT_UPDATED_SUCCESS", data));
    },
);

export const deleteLawyerFeesContract = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const result = await service.remove(req.params.id as string);
        res.status(200).json(new AppResponse(true, result.message));
    },
);

export const generateLawyerFeesContractPdf = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { data, regenerated } = await service.generateAndUploadPdf(req.params.id as string);
        const messageKey = regenerated
            ? "LAWYER_FEES_CONTRACT_PDF_GENERATED_SUCCESS"
            : "LAWYER_FEES_CONTRACT_PDF_UNCHANGED_USING_EXISTING";
        res.status(200).json(new AppResponse(true, messageKey, data));
    },
);

export const createLawyerFeesContractSigningLink = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const data = await service.createSigningLink(req.params.id as string);
        res.status(200).json(new AppResponse(true, "SIGNING_LINK_CREATED_SUCCESS", data));
    },
);

// ============ Public (no-auth) signing endpoints ============

export const verifySigningIdentity = asyncHandler(
    async (req: Request, res: Response) => {
        const { idNumber } = req.body ?? {};
        const token = req.params.token as string;
        if (!idNumber || typeof idNumber !== "string") {
            res.status(400).json(new AppResponse(false, "ID_NUMBER_REQUIRED", null, 400));
            return;
        }
        const data = await service.verifyTokenAndIdentity(token, idNumber);
        res.status(200).json(new AppResponse(true, "SIGNING_IDENTITY_VERIFIED", data));
    },
);

export const submitSignedContract = asyncHandler(
    async (req: Request, res: Response) => {
        const { idNumber, signature } = req.body ?? {};
        const token = req.params.token as string;
        if (!idNumber || typeof idNumber !== "string") {
            res.status(400).json(new AppResponse(false, "ID_NUMBER_REQUIRED", null, 400));
            return;
        }
        if (!signature || typeof signature !== "string") {
            res.status(400).json(new AppResponse(false, "SIGNATURE_REQUIRED", null, 400));
            return;
        }
        const data = await service.submitSignature(token, idNumber, signature);
        res.status(200).json(new AppResponse(true, "CONTRACT_SIGNED_SUCCESS", data));
    },
);
