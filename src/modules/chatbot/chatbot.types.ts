export interface ChatRequest {
    question: string;
    conversationHistory?: ChatMessage[];
}

export interface ChatMessage {
    role: "user" | "model";
    parts: string;
}

export interface ChatResponse {
    answer: string;
    timestamp: string;
    contextVersion: number;
}

/**
 * Sanitized data structures for Gemini context
 * NO sensitive customer data allowed here
 */
export interface ServiceContext {
    id: string;
    name_ar: string;
    name_en: string;
    description_ar: string | null;
    description_en: string | null;
    price: string | null;
}

export interface WorkingDayContext {
    day: string;
    isOpen: boolean;
    startTime: string;
    endTime: string;
}

export interface HolidayContext {
    date: string;
    name: string;
    isFullDay: boolean;
    startTime: string | null;
    endTime: string | null;
}

export interface BookingSystemContext {
    services: ServiceContext[];
    workingDays: WorkingDayContext[];
    holidays: HolidayContext[];
    lastUpdated: string;
    version: number;
}

export interface GeminiConfig {
    apiKey: string;
    model: string;
    temperature: number;
    maxOutputTokens: number;
}
