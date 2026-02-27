/**
 * IPaymentProvider — Strategy Pattern Interface
 *
 * Every payment provider (Stripe, Tamara, Tabby) must implement this contract.
 * The PaymentService and controllers depend ONLY on this interface,
 * never on concrete provider implementations.
 */
export interface CreatePaymentResult {
    url?: string;                  // Checkout/redirect URL (Tamara, Tabby, Stripe Checkout)
    clientSecret?: string;         // Stripe Elements client secret
    paymentIntentId?: string;      // Stripe PI id
    sessionId?: string;            // Checkout session id
    amount: number;
    currency: string;
    provider: PaymentProvider;
}

export interface CaptureResult {
    success: boolean;
    provider: PaymentProvider;
    paymentIntentId: string;
    status: string;
}

export interface CancelResult {
    success: boolean;
    provider: PaymentProvider;
    status: string;               // "released" | "refunded" | "cancelled"
    refundId?: string;
}

export interface WebhookResult {
    received: boolean;
    event?: string;
    bookingId?: string;
}

export type PaymentProvider = "STRIPE" | "TAMARA" | "TABBY";
export type PaymentStatus = "UNPAID" | "PENDING" | "AUTHORIZED" | "PAID" | "RELEASED" | "REFUNDED" | "CANCELLED";

export interface IPaymentProvider {
    readonly name: PaymentProvider;

    /**
     * Step 1 — Initiate payment for a booking.
     * Returns a URL (hosted checkout) or clientSecret (embedded elements).
     * Must save paymentIntentId / sessionId to the booking in DB.
     */
    createPayment(bookingId: string): Promise<CreatePaymentResult>;

    /**
     * Step 2 — Capture authorized/frozen funds (called on admin confirm).
     */
    capture(bookingId: string): Promise<CaptureResult>;

    /**
     * Step 3 — Cancel or refund a payment.
     * If AUTHORIZED → cancel hold (no charge, no refund).
     * If PAID → issue full refund.
     */
    cancel(bookingId: string): Promise<CancelResult>;

    /**
     * Step 4 — Handle incoming webhook from the provider.
     * Verify signature, update booking status in DB.
     */
    handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookResult>;
}