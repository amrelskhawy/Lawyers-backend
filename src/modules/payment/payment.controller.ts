import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { PaymentService } from "./payment.service.js";
import { PaymentFactory } from "./payment.factory.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

const paymentService = new PaymentService();

export const capturePayment = asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const providerStr = req.body?.provider || "STRIPE";
    const provider = PaymentFactory.resolveProvider(providerStr);

    // 1. Capture funds (validates AUTHORIZED state + provider-side status check)
    const captureResult = await paymentService.capture(bookingId, provider);

    // 2. Confirm booking — sets CONFIRMED + handles Meet/Calendar/Email
    //    Lazy import prevents circular dependency: BookingService ↔ PaymentService
    const { BookingService } = await import("../bookings/bookings.service.js");
    const confirmedBooking = await new BookingService().confirmBooking(bookingId);

    res.status(200).json(new AppResponse(true, "PAYMENT_CAPTURED", {
        ...captureResult,
        booking: confirmedBooking,
    }));
});

export const cancelPayment = asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const providerStr = req.body?.provider || "STRIPE";
    const provider = PaymentFactory.resolveProvider(providerStr);

    const result = await paymentService.cancel(bookingId, provider);

    res.status(200).json(new AppResponse(true, "PAYMENT_CANCELLED", result));
});

export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const rawBody = req.body as Buffer;

    const result = await paymentService.handleWebhook(rawBody, signature, "STRIPE");
    res.status(200).json(result);
});


export const tabbyWebhook = asyncHandler(async (req: Request, res: Response) => {
    // Accept either header name — use whichever your Tabby webhook registration uses
    const signature = (req.headers["x-webhook-signature"] as string)
        || (req.headers["x-tabby-signature"] as string)
        || "";
    const rawBody = req.body as Buffer;

    const result = await paymentService.handleWebhook(rawBody, signature, "TABBY");
    res.status(200).json(result);
});