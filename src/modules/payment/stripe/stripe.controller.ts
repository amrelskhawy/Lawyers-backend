import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Stripe from "stripe";
import prisma from "../../../core/db/prisma.js";
import { AppResponse } from "../../../core/utils/AppResponse.js";
import { AuthRequest } from "../../../core/middlewares/authMiddleware.js";
import { StripeService } from "./stripe.service.js";

const stripeService = new StripeService();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-04-10",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

// ─────────────────────────────────────────────────────────────────────────────
// POST /stripe/create-payment-intent
//
// Flow:
//   1. User submits a booking → booking is created with status PENDING
//   2. Client calls this endpoint with the bookingId
//   3. We create a PaymentIntent with capture_method: "manual"
//      → Stripe authorises (freezes) the amount on the customer's card
//      → Money is NOT moved yet; it just cannot be spent by the customer
//   4. We return the clientSecret so the frontend can confirm the card details
//      with Stripe.js / React Stripe Elements
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /stripe/confirm-payment/:bookingId   [Admin only]
//
// Flow:
//   Admin confirms the booking → we capture the previously frozen funds.
//   Money moves from the customer's card into our Stripe account balance.
// ─────────────────────────────────────────────────────────────────────────────
export const capturePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const result = await stripeService.captureAndConfirm(bookingId);
    res.status(200).json({
        success: true,
        message: "PAYMENT_CAPTURED",
        data: result,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /stripe/cancel-payment/:bookingId   [Admin only]
//
// Flow:
//   Admin cancels the booking → we cancel the PaymentIntent.
//   Because no capture ever happened, Stripe simply releases the authorisation
//   hold on the customer's card.
//
//   Result:
//     ✅ Customer's frozen money is released (hold lifted)
//     ✅ No charge was made → no refund required
//     ✅ Booking status set to CANCELLED
// ─────────────────────────────────────────────────────────────────────────────
export const cancelPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const result = await stripeService.cancelAndRefund(bookingId);
    res.status(200).json({
        success: true,
        message: "PAYMENT_CANCELLED",
        data: result,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /stripe/webhook
//
// Stripe sends signed events here as a safety net / audit trail.
// IMPORTANT: This route must use express.raw() middleware (not express.json())
//            so the raw body is available for signature verification.
// ─────────────────────────────────────────────────────────────────────────────
export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const result = await stripeService.handleWebhook(req.body, signature);
    res.status(200).json(result);
});