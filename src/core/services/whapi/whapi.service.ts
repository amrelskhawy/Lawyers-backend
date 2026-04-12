import { AppResponse } from "../../utils/AppResponse.js";

export interface WhapiTextPayload {
    to: string;
    body: string;
}

export interface WhapiDocumentPayload {
    to: string;
    media: string;
    filename: string;
    caption?: string;
}

interface WhapiSendResponse {
    sent: boolean;
    message?: {
        id: string;
        from_me: boolean;
        type: string;
    };
}

export function normalisePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
        throw new AppResponse(false, "WHAPI_INVALID_PHONE_NUMBER", null, 400);
    }
    return digits;
}


export class WhapiService {
    private readonly baseUrl: string;
    private readonly token: string;

    constructor() {
        const token = process.env.WHAPI_TOKEN;
        const baseUrl = process.env.WHAPI_BASE_URL ?? "https://gate.whapi.cloud";

        if (!token) {
            throw new Error(
                "WHAPI_TOKEN environment variable is not set. " +
                "WhatsApp integration cannot start.",
            );
        }

        this.token = token;
        this.baseUrl = baseUrl.replace(/\/$/, ""); // strip trailing slash
    }

    private get headers(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${this.token}`,
        };
    }

    /**
     * Central fetch wrapper.  Translates non-2xx responses into AppResponse
     * exceptions with human-readable error codes so callers don't need to
     * inspect raw HTTP details.
     */
    private async request<T>(
        method: "POST",
        path: string,
        body: Record<string, unknown>,
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;

        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers: this.headers,
                body: JSON.stringify(body),
            });
        } catch (networkErr) {
            // DNS / connection failures
            throw new AppResponse(false, "WHAPI_NETWORK_ERROR", null, 503);
        }

        if (response.ok) {
            return response.json() as Promise<T>;
        }

        // Map well-known Whapi HTTP status codes to descriptive error keys
        switch (response.status) {
            case 400:
                throw new AppResponse(false, "WHAPI_BAD_REQUEST", null, 400);
            case 401:
                throw new AppResponse(false, "WHAPI_UNAUTHORIZED", null, 401);
            case 402:
                throw new AppResponse(false, "WHAPI_PLAN_LIMIT_EXCEEDED", null, 402);
            case 404:
                throw new AppResponse(false, "WHAPI_CHANNEL_NOT_FOUND", null, 404);
            case 429:
                throw new AppResponse(false, "WHAPI_RATE_LIMIT_EXCEEDED", null, 429);
            case 500:
            case 502:
            case 503:
                throw new AppResponse(false, "WHAPI_UPSTREAM_ERROR", null, 502);
            default:
                throw new AppResponse(false, "WHAPI_UNEXPECTED_ERROR", null, 500);
        }
    }

    async sendText(to: string, body: string): Promise<WhapiSendResponse> {
        const phone = normalisePhone(to);
        return this.request<WhapiSendResponse>("POST", "/messages/text", {
            to: phone,
            body,
        });
    }

    async sendDocument(
        to: string,
        payload: { media: string; filename: string; caption?: string },
    ): Promise<WhapiSendResponse> {
        const phone = normalisePhone(to);
        return this.request<WhapiSendResponse>("POST", "/messages/document", {
            to: phone,
            media: payload.media,
            filename: payload.filename,
            ...(payload.caption ? { caption: payload.caption } : {}),
        });
    }
}

export const whapiService = new WhapiService();