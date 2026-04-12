import { describe, it, expect } from "bun:test";
import { waapiService, normalisePhone } from "./src/core/services/waapi.pro/waapi.service.js";
import { AppResponse } from "./src/core/utils/AppResponse.js";

describe("WaapiService Live Integration Test", () => {

    // 1. Verify Environment Variables are loaded into the process
    describe("Environment Configuration", () => {
        it("should have WAAPI_APP_KEY and WAAPI_AUTH_KEY defined", () => {
            expect(process.env.WAAPI_APP_KEY).toBeDefined();
            expect(process.env.WAAPI_AUTH_KEY).toBeDefined();

            // Basic length check to ensure they aren't empty strings
            expect(process.env.WAAPI_APP_KEY?.length).toBeGreaterThan(5);
            expect(process.env.WAAPI_AUTH_KEY?.length).toBeGreaterThan(5);
        });
    });

    // 2. Real API Call Test to verify .env credentials
    describe("Live API Connectivity", () => {
        /**
         * The number 01203035328 formatted for international delivery.
         * Waapi expects digits only: 20 (Egypt) + 1203035328.
         */
        const TARGET_PHONE = "201203035328";

        it("should successfully authenticate and send a message using .env variables", async () => {
            try {
                const result = await waapiService.sendText(
                    TARGET_PHONE,
                    "Integration Test: Your .env variables are WORKING! "
                );

                // "Success" confirms both keys and the instance are active
                expect(result.message_status).toBe("Success");

                console.log("Full Waapi Response:", JSON.stringify(result, null, 2));
            } catch (err: any) {
                // Detailed logging to help you fix the .env if it fails
                console.error(" Integration Failed!");
                console.error("Error Message:", err.message);

                // If this fails, your keys in .env are likely incorrect
                expect(err.message).not.toBe("WAAPI_UNAUTHORIZED");

                // If this fails, check your balance/instance status in the dashboard
                expect(err.message).not.toBe("WAAPI_ACCOUNT_INACTIVE_OR_NO_BALANCE");

                throw err;
            }
        }, { timeout: 30000 }); // Increased to 30s to prevent network timeouts
    });

    describe("Phone Normalisation Check", () => {
        it("should strip non-digit characters correctly", () => {
            expect(normalisePhone("+20 120-303-5328")).toBe("201203035328");
        });
    });
});