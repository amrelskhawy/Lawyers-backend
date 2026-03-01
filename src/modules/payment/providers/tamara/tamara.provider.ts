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
        throw new AppResponse(false, "NOT_IMPLEMENTED", null, 501);
    }
}
