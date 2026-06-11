import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsAppFile, sendWhatsAppMessage } from "./waapi.service.js";

const fetchMock = vi.fn();

function waapiResponse(body: unknown, ok = true) {
    return {
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    };
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.WAAPI_APP_KEY = "app";
    process.env.WAAPI_AUTH_KEY = "auth";
    fetchMock.mockReset();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("sendWhatsAppFile", () => {
    it("resolves when WAAPI reports success", async () => {
        fetchMock.mockResolvedValue(
            waapiResponse({ message_status: "Success", data: { status_code: 200 } }),
        );

        await expect(
            sendWhatsAppFile("966500000000", "https://files/x.pdf", "hi"),
        ).resolves.toMatchObject({ message_status: "Success" });
    });

    it("throws when WAAPI returns HTTP 200 but message_status is an error", async () => {
        fetchMock.mockResolvedValue(
            waapiResponse({ message_status: "Error", data: { status_code: 400 } }),
        );

        await expect(
            sendWhatsAppFile("966500000000", "https://files/x.pdf", "hi"),
        ).rejects.toThrow(/WAAPI/);
    });
});

describe("sendWhatsAppMessage", () => {
    it("throws when WAAPI returns HTTP 200 but message_status is an error", async () => {
        fetchMock.mockResolvedValue(
            waapiResponse({ message_status: "Failed", data: { status_code: 400 } }),
        );

        await expect(sendWhatsAppMessage("966500000000", "hi")).rejects.toThrow(/WAAPI/);
    });
});
