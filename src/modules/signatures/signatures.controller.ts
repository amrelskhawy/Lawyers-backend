import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { SignatureService } from "./signatures.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const service = new SignatureService();

export const listSignatures = asyncHandler(async (_req: Request, res: Response) => {
    const data = await service.list();
    res.status(200).json(new AppResponse(true, "SIGNATURES_RETRIEVED", data));
});

export const createSignature = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppResponse(false, "SIGNATURE_FILE_REQUIRED", null, 400);
    }
    const data = await service.create(req.file);
    res.status(201).json(new AppResponse(true, "SIGNATURE_SAVED", data));
});

export const deleteSignature = asyncHandler(async (req: Request, res: Response) => {
    const data = await service.remove(req.params.id as string);
    res.status(200).json(new AppResponse(true, "SIGNATURE_DELETED", data));
});
