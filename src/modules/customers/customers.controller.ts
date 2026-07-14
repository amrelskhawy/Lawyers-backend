import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { CustomerService } from "./customers.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const customerService = new CustomerService();

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
    const { data, meta } = await customerService.listCustomers(req.query);
    res.status(200).json(new AppResponse(true, "CUSTOMERS_RETRIEVED_SUCCESS", data, 200, meta));
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const customer = await customerService.getCustomerById(id);
    res.status(200).json(new AppResponse(true, "CUSTOMER_RETRIEVED_SUCCESS", customer));
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.createCustomer(req.body);
    res.status(201).json(new AppResponse(true, "CUSTOMER_CREATED_SUCCESS", customer));
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const customer = await customerService.updateCustomer(id, req.body);
    res.status(200).json(new AppResponse(true, "CUSTOMER_UPDATED_SUCCESS", customer));
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await customerService.deleteCustomer(id);
    res.status(200).json(new AppResponse(true, result.message));
});

export const sendCustomerDocument = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!req.file) {
        throw new AppResponse(false, "DOCUMENT_FILE_REQUIRED", null, 400);
    }
    const result = await customerService.sendDocument(id, req.file, req.body?.caption);
    res.status(200).json(new AppResponse(true, "DOCUMENT_SENT", result));
});

export const deleteMultipleCustomers = asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body;
    const result = await customerService.deleteMultipleCustomers(ids);
    res.status(200).json(new AppResponse(true, "CUSTOMERS_DELETED_SUCCESS", result));
});
