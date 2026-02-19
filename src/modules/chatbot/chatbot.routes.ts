/**
 * Chatbot Routes
 * Defines API endpoints for chatbot functionality
 */

import { Router } from "express";
import { chatbotController } from "./chatbot.controller.js";

const router = Router();

/**
 * @route   POST /api/v1/chat
 * @desc    Ask a question to the chatbot
 * @access  Public (add authentication middleware if needed)
 */
router.post("/", chatbotController.askQuestion.bind(chatbotController));

/**
 * @route   GET /api/v1/chat/context
 * @desc    Get current context information
 * @access  Public
 */
router.get("/context", chatbotController.getContextInfo.bind(chatbotController));

/**
 * @route   POST /api/v1/chat/refresh
 * @desc    Manually refresh the chatbot context
 * @access  Admin (TODO: Add authentication middleware)
 */
router.post("/refresh", chatbotController.refreshContext.bind(chatbotController));

router.get("/health", chatbotController.healthCheck.bind(chatbotController));

export default router;
