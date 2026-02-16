import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { eventBus, EVENTS } from "../../core/utils/events.js";

export class ChatbotService {
    private genAI: GoogleGenerativeAI;
    private model: any;
    private contextData: string = "";
    private isInitialized: boolean = false;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("GEMINI_API_KEY is not set. Chatbot will not function correctly.");
        }
        this.genAI = new GoogleGenerativeAI(apiKey || "");
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    async init() {
        if (this.isInitialized) return;

        console.log("Initializing Chatbot Service...");
        await this.updateContext();

        // Subscribe to data changes
        eventBus.on(EVENTS.DATA_CHANGED, async () => {
            console.log("Data changed event received. Updating Chatbot context...");
            await this.updateContext();
        });

        this.isInitialized = true;
    }

    private async updateContext() {
        try {
            const [services, workdays, holidays] = await Promise.all([
                prisma.service.findMany({
                    select: {
                        name_en: true,
                        description_en: true,
                        price: true
                    }
                }),
                prisma.workingDay.findMany({
                    where: { isOpen: true },
                    select: {
                        day: true,
                        startTime: true,
                        endTime: true
                    }
                }),
                prisma.holiday.findMany({
                    where: { date: { gte: new Date() } },
                    select: {
                        date: true,
                        name: true,
                        isFullDay: true,
                        startTime: true,
                        endTime: true
                    }
                })
            ]);

            let context = "You are a helpful assistant for a booking system. Answer questions based ONLY on the following information:\n\n";

            context += "=== SERVICES ===\n";
            if (services.length === 0) {
                context += "No services available currently.\n";
            } else {
                services.forEach(s => {
                    context += `- Service: ${s.name_en}\n  Description: ${s.description_en || 'N/A'}\n  Price: ${s.price}\n`;
                });
            }

            context += "\n=== WORKING HOURS ===\n";
            if (workdays.length === 0) {
                context += "No working hours defined.\n";
            } else {
                workdays.forEach(w => {
                    context += `- ${w.day}: ${w.startTime} - ${w.endTime}\n`;
                });
            }

            context += "\n=== UPCOMING HOLIDAYS ===\n";
            if (holidays.length === 0) {
                context += "No upcoming holidays.\n";
            } else {
                holidays.forEach(h => {
                    context += `- ${h.name} on ${h.date.toDateString()}`;
                    if (!h.isFullDay) {
                        context += ` (${h.startTime || 'N/A'} - ${h.endTime || 'N/A'})`;
                    }
                    context += "\n";
                });
            }

            context += "\nIMPORTANT: Do not invent information. If the answer is not in the context, say you don't know. Be polite and concise.";

            this.contextData = context;
            console.log("Chatbot context updated successfully.");

        } catch (error) {
            console.error("Failed to update Chatbot context:", error);
        }
    }

    async ask(question: string): Promise<string> {
        if (!this.contextData) {
            await this.updateContext();
        }

        try {
            const prompt = `${this.contextData}\n\nUser Question: ${question}\nAnswer:`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error: any) {
            console.error("Gemini API Error:", error);
            throw new AppError("Failed to generate response", 500, "GEMINI_ERROR");
        }
    }
}
