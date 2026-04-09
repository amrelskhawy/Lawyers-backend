import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { OrganizerService } from "./organizers.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const organizerService = new OrganizerService();

export const listOrganizers = asyncHandler(async (req: Request, res: Response) => {
    const organizers = await organizerService.getAllOrganizers();
    res.status(200).json(new AppResponse(true, "ORGANIZERS_RETRIEVED_SUCCESS", organizers));
});

export const getOrganizer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const organizer = await organizerService.getOrganizerById(id);
    res.status(200).json(new AppResponse(true, "ORGANIZER_RETRIEVED_SUCCESS", organizer));
});

export const createOrganizer = asyncHandler(async (req: Request, res: Response) => {
    const organizer = await organizerService.createOrganizer(req.body);
    res.status(201).json(new AppResponse(true, "ORGANIZER_CREATED_SUCCESS", organizer));
});

export const updateOrganizer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const organizer = await organizerService.updateOrganizer(id, req.body);
    res.status(200).json(new AppResponse(true, "ORGANIZER_UPDATED_SUCCESS", organizer));
});

export const deleteOrganizer = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const result = await organizerService.deleteOrganizer(id);
    res.status(200).json(new AppResponse(true, result.message));
});

export const deleteMultipleOrganizers = asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    const result = await organizerService.deleteMultipleOrganizers(ids);
    res.status(200).json(new AppResponse(true, "ORGANIZERS_DELETED_SUCCESS", result));
});
