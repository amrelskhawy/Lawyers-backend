import { z } from "zod";

export const ChatRequestSchema = z.object({
    question: z.string().min(1, "Question cannot be empty"),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
    answer: string;
}
