/**
 * Chatbot Service
 * Handles AI-powered chatbot interactions using Google Gemini
 * Features:
 * - Context preloading on server startup
 * - Real-time context updates via event listeners
 * - Data sanitization (no sensitive customer data)
 * - Conversation management
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { appEvents, SystemEvents } from "../../core/utils/events.js";
import {
    ChatRequest,
    ChatResponse,
    BookingSystemContext,
    ServiceContext,
    WorkingDayContext,
    HolidayContext,
    GeminiConfig,
} from "./chatbot.types.js";

export class ChatbotService {
    private genAI: GoogleGenerativeAI;
    private model: any;
    private context: BookingSystemContext;
    private contextVersion: number = 0;
    private systemInstruction: string = "";
    private config: GeminiConfig;

    constructor() {
        // Initialize Gemini configuration
        this.config = {
            apiKey: process.env.GEMINI_API_KEY || "",
            model: "gemini-pro",
            temperature: 0.7,
            maxOutputTokens: 2048,
        };

        if (!this.config.apiKey) {
            throw new Error("GEMINI_API_KEY is not configured in environment variables");
        }

        this.genAI = new GoogleGenerativeAI(this.config.apiKey);

        // Initialize empty context
        this.context = {
            services: [],
            workingDays: [],
            holidays: [],
            lastUpdated: new Date().toISOString(),
            version: 0,
        };

        // Subscribe to data change events
        this.subscribeToEvents();
    }

    /**
     * Initialize chatbot: Load data and set up Gemini model
     * Call this on server startup
     */
    async initialize(): Promise<void> {
        try {
            console.log("Initializing Chatbot Service...");

            // Load initial context data
            await this.updateContext();

            console.log(`Chatbot initialized with context version ${this.contextVersion}`);
            console.log(`Loaded: ${this.context.services.length} services, ${this.context.workingDays.length} working days, ${this.context.holidays.length} holidays`);
        } catch (error: any) {
            console.error("Failed to initialize chatbot:", error.message);
            throw new AppError("Chatbot initialization failed", 500, "CHATBOT_INIT_FAILED");
        }
    }

    /**
     * Subscribe to system events for automatic context updates
     */
    private subscribeToEvents(): void {
        appEvents.on(SystemEvents.DATA_CHANGED, async (event) => {
            console.log(`Data change detected: ${event.eventType}`);
            await this.updateContext();
        });
    }

    async updateContext(): Promise<void> {
        try {
            // Fetch data from database
            const [services, workingDays, holidays] = await Promise.all([
                this.fetchServices(),
                this.fetchWorkingDays(),
                this.fetchHolidays(),
            ]);

            // Update context
            this.context = {
                services,
                workingDays,
                holidays,
                lastUpdated: new Date().toISOString(),
                version: ++this.contextVersion,
            };

            // Generate system instruction for Gemini
            this.systemInstruction = this.generateSystemInstruction();

            // Reinitialize model with updated context
            this.initializeModel();

            console.log(`Context updated to version ${this.contextVersion}`);
        } catch (error: any) {
            console.error("Failed to update context:", error.message);
            throw new AppError("Context update failed", 500, "CONTEXT_UPDATE_FAILED");
        }
    }

    /**
     * Fetch and sanitize services data (NO customer data)
     */
    private async fetchServices(): Promise<ServiceContext[]> {
        const services = await prisma.service.findMany({
            orderBy: { name_en: "asc" },
        });

        return services.map((service) => ({
            id: service.id,
            name_ar: service.name_ar,
            name_en: service.name_en,
            description_ar: service.description_ar,
            description_en: service.description_en,
            price: service.price ? service.price.toString() : null,
        }));
    }

    /**
     * Fetch working days configuration
     */
    private async fetchWorkingDays(): Promise<WorkingDayContext[]> {
        const workingDays = await prisma.workingDay.findMany({
            orderBy: { day: "asc" },
        });

        return workingDays.map((day) => ({
            day: day.day,
            isOpen: day.isOpen,
            startTime: day.startTime,
            endTime: day.endTime,
        }));
    }

    /**
     * Fetch holidays (public data only - no customer bookings)
     */
    private async fetchHolidays(): Promise<HolidayContext[]> {
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: new Date(), // Only future/current holidays
                },
            },
            orderBy: { date: "asc" },
            take: 50, // Limit to next 50 holidays
        });

        return holidays.map((holiday) => ({
            date: holiday.date.toISOString().split("T")[0],
            name: holiday.name,
            isFullDay: holiday.isFullDay,
            startTime: holiday.startTime,
            endTime: holiday.endTime,
        }));
    }


    private generateSystemInstruction(): string {
        const servicesText = this.context.services.length > 0
            ? this.context.services
                .map(
                    (s) =>
                        `- ${s.name_en} (${s.name_ar}): ${s.description_en || s.description_ar || "No description"}\n  Price: ${s.price || "Contact for price"}`
                )
                .join("\n")
            : "No services available";

        const workingDaysText = this.context.workingDays.length > 0
            ? this.context.workingDays
                .map((w) =>
                    w.isOpen
                        ? `${w.day}: ${w.startTime} - ${w.endTime}`
                        : `${w.day}: Closed`
                )
                .join("\n")
            : "Default hours: Monday-Friday 09:00-17:00";

        const holidaysText = this.context.holidays.length > 0
            ? this.context.holidays
                .map((h) =>
                    h.isFullDay
                        ? `${h.date}: ${h.name} (Full day closure)`
                        : `${h.date}: ${h.name} (Closed ${h.startTime} - ${h.endTime})`
                )
                .join("\n")
            : "No upcoming holidays";

        return `You are an AI assistant for a booking system. Your role is to help users understand our services, availability, and booking policies.

**IMPORTANT RULES:**
1. You can ONLY answer questions about services, working hours, holidays, and general booking information
2. You CANNOT access or discuss specific customer bookings, personal information, or private data
3. If asked about specific bookings, politely explain that customers should contact support directly
4. Be helpful, professional, and concise
5. If you don't know something, admit it rather than making up information

**AVAILABLE SERVICES:**
${servicesText}

**WORKING HOURS:**
${workingDaysText}

**UPCOMING HOLIDAYS/CLOSURES:**
${holidaysText}

**BOOKING POLICIES:**
- Bookings can be made during working hours only
- Bookings cannot be made on holidays or during closure periods
- Each booking requires a valid email address
- Bookings can be in PENDING, CONFIRMED, COMPLETED, or CANCELLED status

**Context Version:** ${this.contextVersion}
**Last Updated:** ${this.context.lastUpdated}

When answering questions:
- Focus on helping users understand what services are available
- Explain working hours clearly
- Inform about any upcoming closures
- Guide users on how to make bookings
- Do NOT attempt to create bookings or access customer data`;
    }

    /**
     * Initialize or reinitialize the Gemini model with current system instruction
     */
    private initializeModel(): void {
        this.model = this.genAI.getGenerativeModel({
            model: this.config.model,
            systemInstruction: this.systemInstruction,
            generationConfig: {
                temperature: this.config.temperature,
                maxOutputTokens: this.config.maxOutputTokens,
            },
        });
    }

    /**
     * Ask a question to the chatbot
     * Supports optional conversation history for context
     */
    async ask(request: ChatRequest): Promise<ChatResponse> {
        try {
            if (!request.question || request.question.trim().length === 0) {
                throw new AppError("Question cannot be empty", 400, "EMPTY_QUESTION");
            }

            // Security check: Prevent injection attempts
            if (this.containsSuspiciousContent(request.question)) {
                throw new AppError(
                    "Invalid question format",
                    400,
                    "SUSPICIOUS_CONTENT"
                );
            }

            // Start or continue chat
            let result;

            if (request.conversationHistory && request.conversationHistory.length > 0) {
                // Continue existing conversation
                const chat = this.model.startChat({
                    history: request.conversationHistory.map((msg) => ({
                        role: msg.role,
                        parts: [{ text: msg.parts }],
                    })),
                });

                result = await chat.sendMessage(request.question);
            } else {
                // New conversation - use generateContent directly for potentially better compatibility
                result = await this.model.generateContent(request.question);
            }

            const answer = result.response.text();
            console.log("Chatbot answer received successfully");

            return {
                answer: answer.trim(),
                timestamp: new Date().toISOString(),
                contextVersion: this.contextVersion,
            };
        } catch (error: any) {
            console.error("Chatbot error:", error.message);

            // Handle specific Gemini API errors
            if (error.message?.includes("API key")) {
                throw new AppError("AI service configuration error", 500, "API_KEY_ERROR");
            }

            if (error.message?.includes("quota")) {
                throw new AppError("AI service temporarily unavailable", 503, "QUOTA_EXCEEDED");
            }

            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError(
                "Failed to process your question",
                500,
                "CHATBOT_ERROR"
            );
        }
    }

    /**
     * Basic security check to prevent prompt injection
     */
    private containsSuspiciousContent(text: string): boolean {
        const suspiciousPatterns = [
            /ignore\s+(previous|all|above)\s+instructions/i,
            /you\s+are\s+now/i,
            /system\s*:\s*/i,
            /role\s*:\s*system/i,
            /<\|im_start\|>/i,
            /<\|im_end\|>/i,
        ];

        return suspiciousPatterns.some((pattern) => pattern.test(text));
    }

    /**
     * Get current context information (for debugging/monitoring)
     */
    getContextInfo() {
        return {
            version: this.contextVersion,
            lastUpdated: this.context.lastUpdated,
            statistics: {
                services: this.context.services.length,
                workingDays: this.context.workingDays.length,
                holidays: this.context.holidays.length,
            },
        };
    }

    /**
     * Force context refresh (useful for manual updates)
     */
    async refreshContext(): Promise<void> {
        console.log("Manual context refresh triggered");
        await this.updateContext();
    }
}

// Export singleton instance
export const chatbotService = new ChatbotService();
