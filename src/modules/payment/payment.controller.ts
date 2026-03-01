import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { PaymentService } from "./payment.service.js";
import { PaymentFactory } from "./payment.factory.js";
import { PaymentValidator } from "./validators/payment.validator.js";
import { AuthRequest } from "../../core/middlewares/authMiddleware.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { BookingService } from "../../modules/bookings/bookings.service.js";

const paymentService = new PaymentService();
const bookingService = new BookingService();

export const capturePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const { provider: providerStr } = req.body;

    const provider = PaymentFactory.resolveProvider(providerStr || "STRIPE");
    //const result = await paymentService.capture(bookingId, provider);

    // 1. Capture funds
    const captureResult = await paymentService.capture(bookingId, provider);

    // 2. Confirm booking (Meet, Calendar, Email)
    const confirmedBooking = await bookingService.confirmBooking(bookingId);
    res.status(200).json(new AppResponse(true, "PAYMENT_CAPTURED", {
        ...captureResult,
        booking: confirmedBooking
    }));
    //res.status(200).json(new AppResponse(true, "PAYMENT_CAPTURED", result));
});

export const cancelPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const { provider: providerStr } = req.body;

    const provider = PaymentFactory.resolveProvider(providerStr || "STRIPE");
    const result = await paymentService.cancel(bookingId, provider);

    res.status(200).json(new AppResponse(true, "PAYMENT_CANCELLED", result));
});

export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
    const { provider: providerStr } = req.params;
    const signature = req.headers["stripe-signature"] as string
        || req.headers["x-tamara-signature"] as string
        || req.headers["x-tabby-signature"] as string;

    const provider = PaymentFactory.resolveProvider(providerStr);
    const result = await paymentService.handleWebhook(req.body, signature, provider);

    res.status(200).json(result);
});