import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { PaymentService } from "./payment.service.js";
import { PaymentFactory } from "./payment.factory.js";
import { BookingService } from "../../modules/bookings/bookings.service.js";

const paymentService = new PaymentService();
const bookingService = new BookingService();


export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
    const providerStr = req.params.provider as string;
    const signature = (req.headers["stripe-signature"]
        || req.headers["x-tamara-signature"]
        || req.headers["x-tabby-signature"]) as string;

    const provider = PaymentFactory.resolveProvider(providerStr);
    const result = await paymentService.handleWebhook(req.body, signature, provider);

    res.status(200).json(result);
});