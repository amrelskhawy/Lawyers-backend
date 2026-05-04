/**
 * WAAPI WhatsApp integration service.
 * Docs: https://waapi.octopusteam.net/docs
 */

const WAAPI_BASE_URL = "https://waapi.octopusteam.net/api";

interface WaapiSendResult {
    message_status: string;
    data?: {
        from: string;
        to: string;
        status_code: number;
        message_id: string;
    };
}

function getKeys() {
    const appkey = process.env.WAAPI_APP_KEY;
    const authkey = process.env.WAAPI_AUTH_KEY;

    if (!appkey || !authkey) {
        throw new Error("WAAPI_APP_KEY and WAAPI_AUTH_KEY must be set");
    }
    return { appkey, authkey };
}

/**
 * Send a plain text WhatsApp message.
 */
export async function sendWhatsAppMessage(
    to: string,
    message: string,
): Promise<WaapiSendResult> {
    const { appkey, authkey } = getKeys();

    const form = new FormData();
    form.append("appkey", appkey);
    form.append("authkey", authkey);
    form.append("to", to);
    form.append("message", message);

    const res = await fetch(`${WAAPI_BASE_URL}/create-message`, {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WAAPI send message failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<WaapiSendResult>;
}

/**
 * Send a file (PDF, image, etc.) via WhatsApp with an optional caption.
 * @param to   - Recipient phone number in international format (e.g. "966501234567")
 * @param fileUrl - Publicly accessible URL of the file
 * @param caption - Optional message text sent alongside the file
 */
export async function sendWhatsAppFile(
    to: string,
    fileUrl: string,
    caption?: string,
): Promise<WaapiSendResult> {
    const { appkey, authkey } = getKeys();

    const form = new FormData();
    form.append("appkey", appkey);
    form.append("authkey", authkey);
    form.append("to", to);
    form.append("file", fileUrl);
    if (caption) {
        form.append("message", caption);
    }

    const res = await fetch(`${WAAPI_BASE_URL}/create-message`, {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WAAPI send file failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<WaapiSendResult>;
}
