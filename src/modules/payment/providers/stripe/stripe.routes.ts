import express from "express";
import {
    createPaymentIntent,
    capturePayment,
    cancelPayment,
    stripeWebhook,
} from "./stripe.controller.js";
import { protect, moderatorMiddleware } from "../../../../core/middlewares/authMiddleware.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public (no auth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /stripe/create-payment-intent
 * @desc    Create a manual-capture PaymentIntent to freeze funds on the
 *          customer's card without actually charging them yet.
 * @access  Public (called right after booking creation)
 */
router.post("/create-payment-intent", createPaymentIntent);

/**
 * @route   POST /stripe/webhook
 * @desc    Stripe signed webhook endpoint — must receive raw body.
 *          Mount BEFORE express.json() in your app setup, or use
 *          express.raw({ type: "application/json" }) exclusively on this route.
 * @access  Stripe servers only (verified by signature)
 */
router.post(
    "/webhook",
    express.raw({ type: "application/json" }), // raw body required for signature verification
    stripeWebhook
);

// ─────────────────────────────────────────────────────────────────────────────
// Protected (moderator / admin only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route   POST /stripe/confirm-payment/:bookingId
 * @desc    Capture the frozen funds for a booking (admin confirms order).
 *          Money is transferred to our Stripe account balance.
 * @access  Moderator / Admin
 */
router.post("/confirm-payment/:bookingId", protect, moderatorMiddleware, capturePayment);

/**
 * @route   POST /stripe/cancel-payment/:bookingId
 * @desc    Cancel the PaymentIntent for a booking (admin cancels order).
 *          The authorization hold on the customer's card is released.
 *          No charge is made — no refund required.
 * @access  Moderator / Admin
 */
router.post("/cancel-payment/:bookingId", protect, moderatorMiddleware, cancelPayment);

export default router;