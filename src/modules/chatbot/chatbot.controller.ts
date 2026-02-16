import { Request, Response, NextFunction } from "express";
import { ChatbotService } from "./chatbot.service.js";
import { AppError } from "../../core/utils/AppError.js";
import { ChatRequestSchema } from "./chatbot.types.js";

const chatbotService = new ChatbotService();

export const initChatbot = async () => {
    await chatbotService.init();
};

export const handleChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { question } = ChatRequestSchema.parse(req.body);
        const answer = await chatbotService.ask(question);

        res.status(200).json({
            status: "success",
            data: {
                answer
            }
        });
    } catch (error) {
        next(error);
    }
};
