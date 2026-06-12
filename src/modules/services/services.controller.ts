import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ServiceService } from "./services.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const serviceService = new ServiceService();

export const listServices = asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await serviceService.listServices(req.query);
    res.status(200).json(new AppResponse(true, "SERVICES_RETRIEVED_SUCCESS", data, 200, meta));
});

export const getService = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const service = await serviceService.getServiceById(id);
    res.status(200).json(new AppResponse(true, "SERVICE_RETRIEVED_SUCCESS", service));
});

export const createService = asyncHandler(async (req: Request, res: Response) => {
    const service = await serviceService.createService(req.body);
    res.status(201).json(new AppResponse(true, "SERVICE_CREATED_SUCCESS", service));
});

export const updateService = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const service = await serviceService.updateService(id, req.body);
    res.status(200).json(new AppResponse(true, "SERVICE_UPDATED_SUCCESS", service));
});

export const toggleStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const service = await serviceService.toggleServiceStatus(id);
    res.status(200).json(new AppResponse(true, "SERVICE_STATUS_TOGGLED_SUCCESS", service));
});

export const deleteService = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await serviceService.deleteService(id);
    res.status(200).json(new AppResponse(true, result.message));
});

export const deleteMultipleServices = asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    const result = await serviceService.deleteMultipleServices(ids);
    res.status(200).json(new AppResponse(true, "SERVICES_DELETED_SUCCESS", result));
});
