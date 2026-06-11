import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { generateToken } from "./token.js";

beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
});

describe("generateToken", () => {
    it("expires 1 hour after issue (forced session logout)", () => {
        const token = generateToken("u1");
        const decoded = jwt.verify(token, "test-secret") as jwt.JwtPayload;

        expect(decoded.id).toBe("u1");
        expect(decoded.exp! - decoded.iat!).toBe(60 * 60);
    });
});
