import express from "express";
import {
    capturePayment,
    cancelPayment,
    stripeWebhook,
    tabbyWebhook,
} from "./payment.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// ── Webhooks — raw body required for signature verification ───────────────────
router.post("/webhook/stripe", express.raw({ type: "application/json" }), stripeWebhook);
router.post("/webhook/tabby", express.raw({ type: "application/json" }), tabbyWebhook);

// ── Admin actions ─────────────────────────────────────────────────────────────
router.post("/capture/:bookingId", protect, moderatorMiddleware, capturePayment);
router.post("/cancel/:bookingId", protect, moderatorMiddleware, cancelPayment);

export default router;