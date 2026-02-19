/**
 * Chatbot Controller
 * Handles HTTP requests for chatbot interactions
 */

import { Request, Response, NextFunction } from "express";
import { chatbotService } from "./chatbot.service.js";
import { ChatRequest } from "./chatbot.types.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

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
                throw new AppResponse(
                    false,
                    "INVALID_REQUEST",
                    "Question is required and must be a string",
                    400
                );
            }

            if (question.trim().length === 0) {
                throw new AppResponse(false, "EMPTY_QUESTION", "Question cannot be empty", 400);
            }

            if (question.length > 1000) {
                throw new AppResponse(
                    false,
                    "QUESTION_TOO_LONG",
                    "Question is too long (max 1000 characters)",
                    400
                );
            }

            // Optional conversation history validation
            if (conversationHistory) {
                if (!Array.isArray(conversationHistory)) {
                    throw new AppResponse(
                        false,
                        "INVALID_HISTORY",
                        "Conversation history must be an array",
                        400
                    );
                }

                if (conversationHistory.length > 20) {
                    throw new AppResponse(
                        false,
                        "HISTORY_TOO_LONG",
                        "Conversation history too long (max 20 messages)",
                        400
                    );
                }

                // Validate history format
                for (const msg of conversationHistory) {
                    if (!msg.role || !msg.parts) {
                        throw new AppResponse(
                            false,
                            "INVALID_HISTORY_FORMAT",
                            "Invalid conversation history format",
                            400
                        );
                    }
                    if (!["user", "model"].includes(msg.role)) {
                        throw new AppResponse(
                            false,
                            "INVALID_ROLE",
                            "Invalid role in conversation history",
                            400
                        );
                    }
                }
            }

            // Process request
            const response = await chatbotService.ask({
                question: question.trim(),
                conversationHistory,
            });

            return res.status(200).json(new AppResponse(true, "CHAT_SUCCESS", response));
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

            return res.status(200).json(new AppResponse(true, "CONTEXT_INFO_SUCCESS", contextInfo));
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

            return res.status(200).json(
                new AppResponse(true, "CONTEXT_REFRESH_SUCCESS", chatbotService.getContextInfo())
            );
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

            return res.status(200).json(
                new AppResponse(true, "HEALTH_CHECK_SUCCESS", {
                    status: "operational",
                    ...contextInfo,
                })
            );
        } catch (error) {
            next(error);
        }
    }
}

export const chatbotController = new ChatbotController();
