import prisma from "../../../core/db/prisma.js";
import { IPaymentProvider, PaymentProvider, CreatePaymentResult, CaptureResult, CancelResult, WebhookResult, BookingPayload } from "../../interfaces/payment.interface.js";
import { AppResponse } from "../../../../core/utils/AppResponse.js";

export class TamaraProvider implements IPaymentProvider {
    readonly name: PaymentProvider = "TAMARA";

    async createPayment(customer_id: string, amount: number, bookingPayload: BookingPayload): Promise<CreatePaymentResult> {
        throw new AppResponse(false, "NOT_IMPLEMENTED", null, 501);
    }

    async capture(bookingId: string): Promise<CaptureResult> {
        throw new AppResponse(false, "NOT_IMPLEMENTED", null, 501);
    }

    async cancel(bookingId: string): Promise<CancelResult> {
        throw new AppResponse(false, "NOT_IMPLEMENTED", null, 501);
    }

    async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookResult> {
        // Tamara webhook notification logic would go here
        // For now, implementing the promotion/expiry handlers as requested for logic safety
        return { received: true };
    }

    private async onOrderAuthorised(orderId: string) {
        await prisma.$transaction(async (tx) => {
            // Find the RESERVED row created at booking time
            const reservation = await tx.booking.findFirst({
                where: { tamaraOrderId: orderId },
            });

            if (!reservation) {
                console.error("[Tamara] No RESERVED row found for order:", orderId);
                return;
            }

            // Idempotency guard
            if (reservation.paymentStatus === "AUTHORIZED") {
                console.log(`[Tamara] Order ${orderId} already processed — skipping`);
                return;
            }

            await tx.booking.update({
                where: { id: reservation.id },
                data: {
                    status: "PENDING",
                    paymentStatus: "AUTHORIZED",
                },
            });

            console.log(`[Tamara] Booking ${reservation.id} promoted RESERVED → PENDING/AUTHORIZED`);
        }, { isolationLevel: "Serializable" });
    }

    private async onOrderExpired(orderId: string) {
        await prisma.booking.updateMany({
            where: {
                tamaraOrderId: orderId,
                status: "RESERVED",
            },
            data: { status: "CANCELLED" },
        });
        console.log(`[Tamara] Reservation CANCELLED — order expired: ${orderId}`);
    }
}
