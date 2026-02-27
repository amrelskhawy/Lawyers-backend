import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { PaymentService } from "./payment.service.js";
import { PaymentFactory } from "./payment.factory.js";
import { PaymentValidator } from "./payment.validator.js";
import { AuthRequest } from "../../../core/middlewares/authMiddleware.js";
import { AppResponse } from "../../../core/utils/AppResponse.js";

const paymentService = new PaymentService();

/**
 * PaymentController — Thin Layer
 *
 * Responsibilities:
 *   1. Extract data from req
 *   2. Call PaymentService
 *   3. Send response
 *
 * No business logic. No validation. No SDK calls.
 */

// ─────────────────────────────────────────────────────────────────────────────
// POST /payment/initiate
// Body: { bookingId: string, provider: "STRIPE" | "TAMARA" | "TABBY" }
// ─────────────────────────────────────────────────────────────────────────────
export const initiatePayment = asyncHandler(async (req: Request, res: Response) => {
    const { bookingId, provider: providerStr } = req.body;

    PaymentValidator.validateBookingIdInBody(bookingId);

    const provider = PaymentFactory.resolveProvider(providerStr || "STRIPE");
    const result = await paymentService.createPayment(bookingId, provider);

    res.status(200).json(new AppResponse(true, "PAYMENT_INITIATED", result));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /payment/capture/:bookingId   [Admin / Moderator]
// Body: { provider: "STRIPE" | "TAMARA" | "TABBY" }
// ─────────────────────────────────────────────────────────────────────────────
export const capturePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const { provider: providerStr } = req.body;

    const provider = PaymentFactory.resolveProvider(providerStr || "STRIPE");
    const result = await paymentService.capture(bookingId, provider);

    res.status(200).json(new AppResponse(true, "PAYMENT_CAPTURED", result));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /payment/cancel/:bookingId   [Admin / Moderator]
// Body: { provider: "STRIPE" | "TAMARA" | "TABBY" }
// ─────────────────────────────────────────────────────────────────────────────
export const cancelPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const { provider: providerStr } = req.body;

    const provider = PaymentFactory.resolveProvider(providerStr || "STRIPE");
    const result = await paymentService.cancel(bookingId, provider);

    res.status(200).json(new AppResponse(true, "PAYMENT_CANCELLED", result));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /payment/webhook/:provider
// e.g. POST /payment/webhook/stripe
//      POST /payment/webhook/tamara
// ─────────────────────────────────────────────────────────────────────────────
export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
    const { provider: providerStr } = req.params;
    const signature = req.headers["stripe-signature"] as string
        || req.headers["x-tamara-signature"] as string
        || req.headers["x-tabby-signature"] as string;

    const provider = PaymentFactory.resolveProvider(providerStr);
    const result = await paymentService.handleWebhook(req.body, signature, provider);

    res.status(200).json(result);
});