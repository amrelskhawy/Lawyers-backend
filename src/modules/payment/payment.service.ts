import { PaymentFactory } from "./payment.factory.js";
import { PaymentValidator } from "./validators/payment.validator.js";
import { PaymentProvider, BookingPayload } from "./interfaces/payment.interface.js";

export class PaymentService {

    async createPayment(
        customer_id: string,
        amount: number,
        bookingPayload: BookingPayload,
        provider: PaymentProvider
    ) {
        return await PaymentFactory.getProvider(provider)
            .createPayment(customer_id, amount, bookingPayload);
    }

    async capture(bookingId: string, provider: PaymentProvider) {
        await PaymentValidator.validateBookingForCapture(bookingId);
        // Single capture call — controller calls confirmBooking() separately after this
        return await PaymentFactory.getProvider(provider).capture(bookingId);
    }

    async cancel(bookingId: string, provider: PaymentProvider) {
        await PaymentValidator.validateBookingForCancel(bookingId);
        return await PaymentFactory.getProvider(provider).cancel(bookingId);
    }

    async handleWebhook(rawBody: Buffer, signature: string, provider: PaymentProvider) {
        PaymentValidator.validateWebhookSignature(signature);
        return await PaymentFactory.getProvider(provider).handleWebhook(rawBody, signature);
    }
}