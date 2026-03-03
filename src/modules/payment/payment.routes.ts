import express from "express";
import {
    handleWebhook,
} from "./payment.controller.js";

const router = express.Router();

router.post(
    "/webhook/:provider",
    express.raw({ type: "application/json" }),
    handleWebhook
);

export default router;