import prisma from "../../../core/db/prisma.js";
import { AppResponse } from "../../../core/utils/AppResponse.js";

export class PaymentValidator {

    static async validateBookingForCapture(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        if (!booking) {
            throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        }

        if (booking.paymentStatus !== "AUTHORIZED") {
            throw new AppResponse(false, "PAYMENT_NOT_AUTHORIZED", null, 400);
        }

        if (booking.status === "CONFIRMED") {
            throw new AppResponse(false, "BOOKING_ALREADY_CONFIRMED", null, 400);
        }

        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "BOOKING_ALREADY_CANCELLED", null, 400);
        }

        const hasPaymentId = booking.paymentIntentId || (booking as any).tabbyPaymentId;
        if (!hasPaymentId) {
            throw new AppResponse(false, "NO_PAYMENT_ID", null, 400);
        }
        return booking;
    }


    static async validateBookingForCancel(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });

        if (!booking) {
            throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        }

        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "BOOKING_ALREADY_CANCELLED", null, 400);
        }

        if (booking.status === "COMPLETED") {
            throw new AppResponse(false, "BOOKING_ALREADY_COMPLETED", null, 400);
        }

        return booking;
    }


    static validateWebhookSignature(signature: string | undefined) {
        if (!signature) {
            throw new AppResponse(false, "WEBHOOK_SIGNATURE_MISSING", null, 400);
        }
    }

    static validateBookingIdInBody(bookingId: string | undefined) {
        if (!bookingId || typeof bookingId !== "string" || bookingId.trim() === "") {
            throw new AppResponse(false, "BOOKING_ID_REQUIRED", null, 400);
        }
    }
}