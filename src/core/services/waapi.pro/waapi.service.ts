import { AppResponse } from "../../utils/AppResponse.js";


export interface WaapiSendResponse {
    message_status: string;
    data?: {
        from: string;
        to: string;
        status_code: number;
        message_id: string;
    };
}

export function normalisePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
        throw new AppResponse(false, "WAAPI_INVALID_PHONE_NUMBER", null, 400);
    }
    return digits;
}

export class WaapiService {
    private readonly baseUrl: string;
    private readonly appKey: string;
    private readonly authKey: string;

    constructor() {
        const appKey = process.env.WAAPI_APP_KEY;
        const authKey = process.env.WAAPI_AUTH_KEY;
        const baseUrl = process.env.WAAPI_BASE_URL ?? "https://waapi.octopusteam.net/api";

        if (!appKey || !authKey) {
            throw new Error(
                "WAAPI_APP_KEY and WAAPI_AUTH_KEY environment variables must both be set. " +
                "WhatsApp integration cannot start.",
            );
        }

        this.appKey = appKey;
        this.authKey = authKey;
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }


    private buildForm(fields: Record<string, string>): FormData {
        const form = new FormData();
        form.append("appkey", this.appKey);
        form.append("authkey", this.authKey);
        for (const [key, value] of Object.entries(fields)) {
            form.append(key, value);
        }
        return form;
    }

    private async request(form: FormData): Promise<WaapiSendResponse> {
        const url = `${this.baseUrl}/create-message`;

        let response: Response;
        try {
            response = await fetch(url, {
                method: "POST",
                body: form,
            });
        } catch {
            throw new AppResponse(false, "WAAPI_NETWORK_ERROR", null, 503);
        }

        if (response.ok) {
            return response.json() as Promise<WaapiSendResponse>;
        }

        switch (response.status) {
            case 401:
                throw new AppResponse(false, "WAAPI_UNAUTHORIZED", null, 401);
            case 403:
                throw new AppResponse(false, "WAAPI_ACCOUNT_INACTIVE_OR_NO_BALANCE", null, 403);
            case 404:
                throw new AppResponse(false, "WAAPI_ENDPOINT_NOT_FOUND", null, 404);
            case 422:
                throw new AppResponse(false, "WAAPI_VALIDATION_ERROR", null, 422);
            case 500:
            case 502:
            case 503:
                throw new AppResponse(false, "WAAPI_UPSTREAM_ERROR", null, 502);
            default:
                throw new AppResponse(false, "WAAPI_UNEXPECTED_ERROR", null, 500);
        }
    }

    async sendText(to: string, message: string): Promise<WaapiSendResponse> {
        const phone = normalisePhone(to);
        const form = this.buildForm({ to: phone, message });
        return this.request(form);
    }

    async sendDocument(
        to: string,
        payload: { buffer: Buffer; filename: string; caption?: string },
    ): Promise<WaapiSendResponse> {
        const phone = normalisePhone(to);

        const form = new FormData();
        form.append("appkey", this.appKey);
        form.append("authkey", this.authKey);
        form.append("to", phone);
        form.append("message", payload.caption ?? "");

        // Convert Buffer to Blob for the fetch API to recognize it as a file
        const blob = new Blob([payload.buffer], { type: "application/pdf" });
        form.append("file", blob, payload.filename);

        const url = `${this.baseUrl}/create-message`;

        const response = await fetch(url, {
            method: "POST",
            body: form,
            headers: {
                "Accept": "application/json",
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Waapi Media Error:", errorText);
            throw new AppResponse(false, "WAAPI_SEND_FAILED", null, response.status);
        }

        return response.json();
    }
}

export const waapiService = new WaapiService();