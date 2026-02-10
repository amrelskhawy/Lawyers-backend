import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ServiceService } from "./services.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const serviceService = new ServiceService();

export const listServices = asyncHandler(async (req: Request, res: Response) => {
    const services = await serviceService.getAllServices();
    res.status(200).json(new AppResponse(true, "Services retrieved successfully", services));
});

export const getService = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const service = await serviceService.getServiceById(id);
    res.status(200).json(new AppResponse(true, "Service retrieved successfully", service));
});

export const createService = asyncHandler(async (req: Request, res: Response) => {
    const { name, description, price } = req.body;

    const service = await serviceService.createService({ name, description, price });
    res.status(201).json(new AppResponse(true, "Service created successfully", service));
});

export const updateService = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name, description, price } = req.body;

    const service = await serviceService.updateService(id, { name, description, price });
    res.status(200).json(new AppResponse(true, "Service updated successfully", service));
});

export const deleteService = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await serviceService.deleteService(id);
    res.status(200).json(new AppResponse(true, result.message));
});
