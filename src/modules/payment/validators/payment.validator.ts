import prisma from "../../../core/db/prisma.js";
import { AppResponse } from "../../../core/utils/AppResponse.js";

/**
 * PaymentValidator — Single Responsibility
 *
 * Contains ALL validation logic for payment operations.
 * Services and providers call these validators instead of
 * having validation logic scattered across methods.
 */
export class PaymentValidator {

    /**
     * Validates that a booking is ready to be captured (admin confirm).
     */
    static async validateBookingForCapture(bookingId: string) {
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
        });


        if (!booking) {
            throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        }

        // TODO: enahnce it 
        if (booking.status === "CONFIRMED") {
            throw new AppResponse(false, "BOOKING_ALREADY_CONFIRMED", null, 400);
        }

        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "BOOKING_ALREADY_CANCELLED", null, 400);
        }

        if (!booking.paymentIntentId) {
            throw new AppResponse(false, "STRIPE_NO_PAYMENT_INTENT", null, 400);
        }

        if (booking.paymentStatus !== "AUTHORIZED") {
            throw new AppResponse(false, "PAYMENT_NOT_AUTHORIZED", null, 400);
        }

        return booking;
    }

    /**
     * Validates that a booking can be cancelled or refunded.
     */
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

    /**
     * Validates a webhook signature header exists.
     */
    static validateWebhookSignature(signature: string | undefined) {
        if (!signature) {
            throw new AppResponse(false, "WEBHOOK_SIGNATURE_MISSING", null, 400);
        }
    }

    /**
     * Validates bookingId exists in request body.
     */
    static validateBookingIdInBody(bookingId: string | undefined) {
        if (!bookingId || typeof bookingId !== "string" || bookingId.trim() === "") {
            throw new AppResponse(false, "BOOKING_ID_REQUIRED", null, 400);
        }
    }
}