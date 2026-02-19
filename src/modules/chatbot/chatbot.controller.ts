/**
 * Chatbot Controller
 * Handles HTTP requests for chatbot interactions
 */

import { Request, Response, NextFunction } from "express";
import { chatbotService } from "./chatbot.service.js";
import { ChatRequest } from "./chatbot.types.js";
import { AppError } from "../../core/utils/AppError.js";

export class ChatbotController {
    /**
     * POST /api/v1/chat
     * Ask a question to the chatbot
     */
    async askQuestion(req: Request, res: Response, next: NextFunction) {
        try {
            const { question, conversationHistory } = req.body as ChatRequest;

            // Validation
            if (!question || typeof question !== "string") {
                throw new AppError(
                    "Question is required and must be a string",
                    400,
                    "INVALID_REQUEST"
                );
            }

            if (question.trim().length === 0) {
                throw new AppError("Question cannot be empty", 400, "EMPTY_QUESTION");
            }

            if (question.length > 1000) {
                throw new AppError(
                    "Question is too long (max 1000 characters)",
                    400,
                    "QUESTION_TOO_LONG"
                );
            }

            // Optional conversation history validation
            if (conversationHistory) {
                if (!Array.isArray(conversationHistory)) {
                    throw new AppError(
                        "Conversation history must be an array",
                        400,
                        "INVALID_HISTORY"
                    );
                }

                if (conversationHistory.length > 20) {
                    throw new AppError(
                        "Conversation history too long (max 20 messages)",
                        400,
                        "HISTORY_TOO_LONG"
                    );
                }

                // Validate history format
                for (const msg of conversationHistory) {
                    if (!msg.role || !msg.parts) {
                        throw new AppError(
                            "Invalid conversation history format",
                            400,
                            "INVALID_HISTORY_FORMAT"
                        );
                    }
                    if (!["user", "model"].includes(msg.role)) {
                        throw new AppError(
                            "Invalid role in conversation history",
                            400,
                            "INVALID_ROLE"
                        );
                    }
                }
            }

            // Process request
            const response = await chatbotService.ask({
                question: question.trim(),
                conversationHistory,
            });

            return res.status(200).json({
                success: true,
                data: response,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/chat/context
     * Get current context information
     */
    async getContextInfo(req: Request, res: Response, next: NextFunction) {
        try {
            const contextInfo = chatbotService.getContextInfo();

            return res.status(200).json({
                success: true,
                data: contextInfo,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/v1/chat/refresh
     * Manually refresh the context (admin only - add auth middleware as needed)
     */
    async refreshContext(req: Request, res: Response, next: NextFunction) {
        try {
            await chatbotService.refreshContext();

            return res.status(200).json({
                success: true,
                message: "Context refreshed successfully",
                data: chatbotService.getContextInfo(),
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/chat/health
     * Check chatbot service health
     */
    async healthCheck(req: Request, res: Response, next: NextFunction) {
        try {
            const contextInfo = chatbotService.getContextInfo();

            return res.status(200).json({
                success: true,
                message: "Chatbot service is healthy",
                data: {
                    status: "operational",
                    ...contextInfo,
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

export const chatbotController = new ChatbotController();
