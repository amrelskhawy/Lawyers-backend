import express from "express";
import {
    capturePayment,
    cancelPayment,
    handleWebhook,
} from "./payment.controller.js";
import { protect, moderatorMiddleware } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

router.post(
    "/webhook/:provider",
    express.raw({ type: "application/json" }),
    handleWebhook
);

router.post("/capture/:bookingId", protect, moderatorMiddleware, capturePayment);
router.post("/cancel/:bookingId", protect, moderatorMiddleware, cancelPayment);

export default router;