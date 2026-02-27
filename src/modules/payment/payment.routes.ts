import express from "express";
import {
    initiatePayment,
    capturePayment,
    cancelPayment,
    handleWebhook,
} from "./payment.controller.js";
import { protect, moderatorMiddleware } from "../../../core/middlewares/authMiddleware.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route  POST /payment/initiate
 * @body   { bookingId: string, provider: "STRIPE" | "TAMARA" | "TABBY" }
 * @desc   Initiates payment — returns checkout URL or clientSecret
 * @access Public
 */
router.post("/initiate", initiatePayment);

/**
 * @route  POST /payment/webhook/:provider
 * @desc   Webhook receiver for each provider
 *         e.g. POST /payment/webhook/stripe
 *              POST /payment/webhook/tamara
 *              POST /payment/webhook/tabby
 * @access Provider servers only (verified by signature)
 *
 * ⚠️  IMPORTANT: Register this BEFORE express.json() middleware in app.ts
 *     or use express.raw() here to preserve raw body for signature verification
 */
router.post(
    "/webhook/:provider",
    express.raw({ type: "application/json" }),
    handleWebhook
);

// ─────────────────────────────────────────────────────────────────────────────
// Protected (Admin / Moderator only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route  POST /payment/capture/:bookingId
 * @body   { provider: "STRIPE" | "TAMARA" | "TABBY" }
 * @desc   Admin confirms booking → captures frozen funds
 * @access Moderator / Admin
 */
router.post("/capture/:bookingId", protect, moderatorMiddleware, capturePayment);

/**
 * @route  POST /payment/cancel/:bookingId
 * @body   { provider: "STRIPE" | "TAMARA" | "TABBY" }
 * @desc   Admin cancels → releases hold (AUTHORIZED) or refunds (PAID)
 * @access Moderator / Admin
 */
router.post("/cancel/:bookingId", protect, moderatorMiddleware, cancelPayment);

export default router;