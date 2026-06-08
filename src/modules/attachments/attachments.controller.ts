import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AttachmentService } from "./attachments.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";

const service = new AttachmentService();

export const listCaseAttachments = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { caseId } = req.params as { caseId: string };
    const data = await service.listByCase(caseId, req.user);
    res.status(200).json(new AppResponse(true, "ATTACHMENTS_RETRIEVED", data));
});

export const uploadCaseAttachment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { caseId } = req.params as { caseId: string };
    const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!file) {
        res.status(400).json(new AppResponse(false, "ATTACHMENT_FILE_REQUIRED", null, 400));
        return;
    }
    const data = await service.upload(caseId, file, req.user);
    res.status(201).json(new AppResponse(true, "ATTACHMENT_UPLOADED", data));
});

export const sendCaseAttachment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    const { message } = (req.body ?? {}) as { message?: string };
    const data = await service.send(id, req.user, message);
    res.status(200).json(new AppResponse(true, "ATTACHMENT_SENT", data));
});

export const deleteCaseAttachment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    const data = await service.remove(id, req.user);
    res.status(200).json(new AppResponse(true, "ATTACHMENT_DELETED", data));
});
