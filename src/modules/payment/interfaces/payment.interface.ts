export type PaymentProvider = "STRIPE" | "TABBY" | "TAMARA";

export interface BookingPayload {
    serviceId: string;
    clientEmail: string;
    name: string;
    phone: string;
    date: string;
    startTime: string;
    endTime: string;
    totalAmount: string;
}

// ── Result types (kept for stripe.provider.ts compatibility) 

export interface CreatePaymentResult {
    url: string;
    sessionId?: string;
    paymentId?: string;
    orderId?: string;
    qrCode?: string | null;
    amount?: number;
    currency?: string;
    provider: string;
}

export interface CaptureResult {
    success: boolean;
    provider: string;
    paymentIntentId?: string;
    status?: string;
    booking?: any;
}

export interface CancelResult {
    success: boolean;
    provider: string;
    status: string;
    refundId?: string;
    booking?: any;
}

export interface WebhookResult {
    received: boolean;
    event?: string;
}

export interface IPaymentProvider {
    createPayment(
        customer_id: string,
        amount: number,
        payload: BookingPayload
    ): Promise<CreatePaymentResult>;

    handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookResult>;

    capture(bookingId: string): Promise<CaptureResult>;

    cancel(bookingId: string): Promise<CancelResult>;
}