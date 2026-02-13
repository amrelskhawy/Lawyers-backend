import { format } from "date-fns";
import prisma from "../../core/db/prisma.js";

export class ChatbotService {
    private intents = [
        {
            name: "GREETING",
            keywords: {
                en: ["hi", "hello", "hey", "start", "greeting"],
                ar: ["مرحبا", "هلو", "السلام", "اهلا"]
            }
        },
        {
            name: "GET_SERVICES",
            keywords: {
                en: ["services", "list", "what do you do", "provide"],
                ar: ["خدمات", "عرض", "ماذا تقدم", "قائمة"]
            }
        },
        {
            name: "GET_HOURS",
            keywords: {
                en: ["hours", "open", "time", "scheduled", "working"],
                ar: ["ساعات", "عمل", "متى", "وقت", "توقيت"]
            }
        },
        {
            name: "GET_HOLIDAYS",
            keywords: {
                en: ["holiday", "closed", "off", "vacation"],
                ar: ["اجازة", "عطلة", "مغلق", "اجازات"]
            }
        },
        {
            name: "BOOKING_PROMPT",
            keywords: {
                en: ["book", "appointment", "schedule", "reserve"],
                ar: ["حجز", "موعد", "نسق", "احجز"]
            }
        }
    ];

    async processMessage(message: string) {
        const lang = this.detectLanguage(message);
        const normalizedMsg = message.toLowerCase();

        // 1. Check for specific service inquiry 
        const serviceInquiry = await this.checkForServiceInquiry(normalizedMsg, lang);
        if (serviceInquiry) return serviceInquiry;

        // 2. Identify Intent
        const intent = this.identifyIntent(normalizedMsg);

        // 3. Generate Response based on Intent
        switch (intent) {
            case "GREETING":
                return this.getGreeting(lang);
            case "GET_SERVICES":
                return await this.listServices(lang);
            case "GET_HOURS":
                return await this.getWorkingHours(lang);
            case "GET_HOLIDAYS":
                return await this.getUpcomingHolidays(lang);
            case "BOOKING_PROMPT":
                return this.getBookingPrompt(lang);
            default:
                return this.getFallback(lang);
        }
    }

    private detectLanguage(message: string): "ar" | "en" {
        const arabicRegex = /[\u0600-\u06FF]/;
        return arabicRegex.test(message) ? "ar" : "en";
    }

    private identifyIntent(message: string): string | null {
        for (const intent of this.intents) {
            const allKeywords = [...intent.keywords.en, ...intent.keywords.ar];
            if (allKeywords.some(kw => message.includes(kw))) {
                return intent.name;
            }
        }
        return null;
    }

    private async checkForServiceInquiry(message: string, lang: "ar" | "en") {
        const services = await prisma.service.findMany();
        for (const service of services) {
            const name = lang === "ar" ? service.name_ar : service.name_en;
            if (message.includes(name.toLowerCase())) {
                const desc = lang === "ar" ? service.description_ar : service.description_en;
                const price = service.price ? `${service.price}` : (lang === "ar" ? "حسب الاتفاق" : "Contact for price");

                if (lang === "ar") {
                    return `${name}: ${desc || "لا يوجد وصف حالياً"}. التكلفة: ${price}.`;
                }
                return `${name}: ${desc || "No description available"}. Price: ${price}.`;
            }
        }
        return null;
    }

    private getGreeting(lang: "ar" | "en") {
        if (lang === "ar") {
            return "مرحباً بك! أنا مساعدك الآلي. يمكنني إخبارك عن خدماتنا، مواعيد العمل، والعطلات القادمة. كيف يمكنني مساعدتك؟";
        }
        return "Hello! I am your automated assistant. I can tell you about our services, working hours, and upcoming holidays. How can I help you today?";
    }

    private async listServices(lang: "ar" | "en") {
        const services = await prisma.service.findMany({
            select: { name_ar: true, name_en: true }
        });

        if (services.length === 0) {
            return lang === "ar" ? "لا توجد خدمات متاحة حالياً." : "No services available at the moment.";
        }

        const serviceNames = services.map(s => lang === "ar" ? s.name_ar : s.name_en);
        if (lang === "ar") {
            return `خدماتنا تشمل: ${serviceNames.join("، ")}. عن أي خدمة تود الاستفسار؟`;
        }
        return `Our services include: ${serviceNames.join(", ")}. Which one would you like to know more about?`;
    }

    private async getWorkingHours(lang: "ar" | "en") {
        const workingDays = await prisma.workingDay.findMany({
            where: { isOpen: true }
        });

        if (workingDays.length === 0) {
            return lang === "ar" ? "نحن مغلقون حالياً لجميع الأيام." : "We are currently closed for all days.";
        }

        const formatted = workingDays.map(d => `${d.day}: ${d.startTime} - ${d.endTime}`);
        if (lang === "ar") {
            return `ساعات العمل لدينا هي:\n${formatted.join("\n")}`;
        }
        return `Our working hours are:\n${formatted.join("\n")}`;
    }

    private async getUpcomingHolidays(lang: "ar" | "en") {
        const holidays = await prisma.holiday.findMany({
            where: { date: { gte: new Date() } },
            orderBy: { date: "asc" },
            take: 3
        });

        if (holidays.length === 0) {
            return lang === "ar" ? "لا توجد عطلات رسمية قادمة." : "There are no upcoming scheduled holidays.";
        }

        const formatted = holidays.map(h => `${format(h.date, "yyyy-MM-dd")} (${h.name})`);
        if (lang === "ar") {
            return `العطلات القادمة:\n${formatted.join("\n")}`;
        }
        return `Upcoming holidays:\n${formatted.join("\n")}`;
    }

    private getBookingPrompt(lang: "ar" | "en") {
        if (lang === "ar") {
            return "لحجز موعد، يرجى زيارة قسم الحجوزات في الموقع أو إخباري باليوم والخدمة التي تفضلها!";
        }
        return "To book an appointment, please visit the booking section of our website or tell me the day and service you prefer!";
    }

    private getFallback(lang: "ar" | "en") {
        if (lang === "ar") {
            return "عذراً، لم أفهم ذلك تماماً. يمكنك سؤالي عن الخدمات، المواعيد، أو العطلات!";
        }
        return "Sorry, I didn't quite catch that. You can ask me about our services, working hours, or upcoming holidays!";
    }
}
