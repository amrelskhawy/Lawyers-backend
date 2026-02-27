import { PaymentFactory } from "./payment.factory.js";
import { PaymentValidator } from "./payment.validator.js";
import { PaymentProvider } from "./payment.interface.js";

/**
 * PaymentService — Orchestration Only
 *
 * This service has ONE job: coordinate between the validator,
 * the factory, and the correct provider.
 *
 * No Stripe/Tamara/Tabby SDK calls here.
 * No validation logic here.
 * No DB calls here.
 *
 * Open/Closed Principle: adding a new provider requires
 * zero changes to this file.
 */
export class PaymentService {

    /**
     * Initiate payment for a booking.
     * Returns a checkout URL or clientSecret depending on the provider.
     */
    async createPayment(bookingId: string, provider: PaymentProvider) {
        // 1. Validate — throws if invalid
        await PaymentValidator.validateBookingForPayment(bookingId);

        // 2. Get the correct provider via factory
        const paymentProvider = PaymentFactory.getProvider(provider);

        // 3. Delegate to provider
        return await paymentProvider.createPayment(bookingId);
    }

    /**
     * Capture frozen funds — called when admin confirms a booking.
     * Delegates to BookingService for Meet/Calendar/Email after capture.
     */
    async capture(bookingId: string, provider: PaymentProvider) {
        // 1. Validate
        await PaymentValidator.validateBookingForCapture(bookingId);

        // 2. Get provider
        const paymentProvider = PaymentFactory.getProvider(provider);

        // 3. Capture funds
        const captureResult = await paymentProvider.capture(bookingId);

        // 4. Delegate rest of confirm flow (Meet, Calendar, Email) to BookingService
        const { BookingService } = await import("../../bookings/bookings.service.js");
        const bookingService = new BookingService();
        const confirmedBooking = await bookingService.confirmBooking(bookingId);

        return { ...captureResult, booking: confirmedBooking };
    }

    /**
     * Cancel or refund a payment.
     * AUTHORIZED → release hold (no charge, no refund).
     * PAID → issue full refund.
     */
    async cancel(bookingId: string, provider: PaymentProvider) {
        // 1. Validate
        await PaymentValidator.validateBookingForCancel(bookingId);

        // 2. Get provider
        const paymentProvider = PaymentFactory.getProvider(provider);

        // 3. Cancel/refund
        return await paymentProvider.cancel(bookingId);
    }

    /**
     * Handle webhook from a payment provider.
     * Routes to the correct provider's webhook handler.
     */
    async handleWebhook(rawBody: Buffer, signature: string, provider: PaymentProvider) {
        // 1. Validate signature header exists
        PaymentValidator.validateWebhookSignature(signature);

        // 2. Get provider
        const paymentProvider = PaymentFactory.getProvider(provider);

        // 3. Handle
        return await paymentProvider.handleWebhook(rawBody, signature);
    }
}