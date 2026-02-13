import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import { ChatbotService } from "./chatbot.service.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AppError } from "../../core/utils/AppError.js";

const chatbotService = new ChatbotService();

export const handleChatMessage = asyncHandler(async (req: Request, res: Response) => {
    const { message } = req.body;

    if (!message) {
        throw new AppError("Message is required", 400, "MESSAGE_REQUIRED");
    }

    const reply = await chatbotService.processMessage(message);
    res.status(200).json(new AppResponse(true, "Reply generated", { reply }));
});
