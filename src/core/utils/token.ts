import jwt from "jsonwebtoken";

export const generateToken = (id: string): string => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined");
    }
    // Sessions are limited to 1 hour — expired tokens fail `protect`
    // with 401 and the frontend forces a logout.
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
    });
};
