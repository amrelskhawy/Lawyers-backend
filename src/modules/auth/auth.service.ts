import prisma from "../../core/db/prisma.js";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { generateToken } from "../../core/utils/token.js";
import { hashToken } from "../../core/utils/hash.js";
import { sendEmail } from "../../core/utils/email.js";
import { RegisterPayload, LoginPayload } from "./auth.types.js";
import { AppResponse } from "../../core/utils/AppResponse.js";

export class AuthService {
    async register(payload: RegisterPayload) {
        const { name, email, password } = payload;

        const userExists = await prisma.user.findUnique({ where: { email } });
        if (userExists) {
            throw new AppResponse(false, "AUTH_USER_ALREADY_EXISTS", null, 400);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
        });

        const token = generateToken(user.id);

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                picture: user.picture,
                isVerified: user.isVerified,
            },
            token,
        };
    }

    async login(payload: LoginPayload) {
        const { email, password } = payload;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new AppResponse(false, "AUTH_USER_NOT_FOUND", null, 404);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new AppResponse(false, "AUTH_PASSWORD_INCORRECT", null, 401);
        }

        const token = generateToken(user.id);

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                picture: user.picture,
                isVerified: user.isVerified,
            },
            token,
        };
    }

    async verifyEmailInitiate(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppResponse(false, "AUTH_USER_NOT_FOUND", null, 404);
        if (user.isVerified) throw new AppResponse(false, "AUTH_USER_ALREADY_VERIFIED", null, 400);

        let tokenRecord = await prisma.token.findFirst({ where: { userId: user.id } });
        if (tokenRecord) {
            await prisma.token.delete({ where: { id: tokenRecord.id } });
        }

        const verificationToken = crypto.randomBytes(64).toString("hex") + user.id;
        const hashedVarToken = hashToken(verificationToken);

        await prisma.token.create({
            data: {
                userId: user.id,
                verificationToken: hashedVarToken,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });

        const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
        await sendEmail(
            "Email Verification",
            user.email,
            process.env.EMAIL_USER!,
            "noreply@gmail.com",
            "emailVerification",
            user.name,
            verificationLink
        );

        return { message: "Email sent" };
    }

    async verifyUser(verificationToken: string) {
        const hashedToken = hashToken(verificationToken);

        const userToken = await prisma.token.findFirst({
            where: {
                verificationToken: hashedToken,
                expiresAt: { gt: new Date() },
            },
        });

        if (!userToken) {
            throw new AppResponse(false, "AUTH_TOKEN_INVALID", null, 400);
        }

        const user = await prisma.user.findUnique({ where: { id: userToken.userId } });
        if (!user) throw new AppResponse(false, "AUTH_USER_NOT_FOUND", null, 404);
        if (user.isVerified) throw new AppResponse(false, "AUTH_USER_ALREADY_VERIFIED", null, 400);

        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true },
        });

        return { message: "User verified" };
    }

    async forgotPassword(email: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) throw new AppResponse(false, "AUTH_USER_NOT_FOUND", null, 404);

        let tokenRecord = await prisma.token.findFirst({ where: { userId: user.id } });
        if (tokenRecord) {
            await prisma.token.delete({ where: { id: tokenRecord.id } });
        }

        const passwordResetToken = crypto.randomBytes(64).toString("hex") + user.id;
        const hashedResetToken = hashToken(passwordResetToken);

        await prisma.token.create({
            data: {
                userId: user.id,
                passwordResetToken: hashedResetToken,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
        });

        const resetLink = `${process.env.CLIENT_URL}/reset-password/${passwordResetToken}`;
        await sendEmail(
            "Password Reset - AuthKit",
            user.email,
            process.env.EMAIL_USER!,
            "noreply@noreply.com",
            "forgotPassword",
            user.name,
            resetLink
        );

        return { message: "Email sent" };
    }

    async resetPassword(resetPasswordToken: string, password: string) {
        const hashedToken = hashToken(resetPasswordToken);

        const userToken = await prisma.token.findFirst({
            where: {
                passwordResetToken: hashedToken,
                expiresAt: { gt: new Date() },
            },
        });

        if (!userToken) {
            throw new AppResponse(false, "AUTH_TOKEN_INVALID", null, 400);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await prisma.user.update({
            where: { id: userToken.userId },
            data: { password: hashedPassword },
        });

        return { message: "Password reset successfully" };
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppResponse(false, "AUTH_USER_NOT_FOUND", null, 404);

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            throw new AppResponse(false, "AUTH_PASSWORD_INCORRECT", null, 401);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        return { message: "Password changed successfully" };
    }
}
