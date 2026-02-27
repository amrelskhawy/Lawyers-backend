import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Stripe from "stripe";
import prisma from "../../../../core/db/prisma.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";
import { AuthRequest } from "../../../../core/middlewares/authMiddleware.js";
import { StripeService } from "./stripe.service.js";

const stripeService = new StripeService();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-04-10",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

export const createPaymentIntent = asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.body;
    if (!bookingId) {
        throw new AppResponse(false, "STRIPE_BOOKING_ID_REQUIRED", null, 400);
    }
    const result = await stripeService.createPaymentIntent(bookingId);
    res.status(200).json({
        success: true,
        message: "PAYMENT_INTENT_CREATED",
        data: result,
    });
});

export const capturePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const result = await stripeService.captureAndConfirm(bookingId);
    res.status(200).json({
        success: true,
        message: "PAYMENT_CAPTURED",
        data: result,
    });
});


export const cancelPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const result = await stripeService.cancelAndRefund(bookingId);
    res.status(200).json({
        success: true,
        message: "PAYMENT_CANCELLED",
        data: result,
    });
});

export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const result = await stripeService.handleWebhook(req.body, signature);
    res.status(200).json(result);
});