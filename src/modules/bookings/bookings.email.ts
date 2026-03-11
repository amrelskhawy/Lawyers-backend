import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { getStripeReceiptUrl } from "../payment/providers/stripe/stripe.provider.js";
import { format } from "date-fns";
import { detectProvider } from "./bookings.helpers.js";

export const sendPaymentLinkEmail = async (
    clientEmail: string,
    payload: any,
    paymentResult: any,
    service: any,
    bookingDay: Date,
    cleanStartTime: string,
    endTime: string,
    provider: any
) => {
    try {
        await sendEmailWithTemplate(
            clientEmail,
            "Complete your booking payment — link expires in 30 minutes",
            "paymentLinkSent",
            {
                name: payload.name,
                payment_link: paymentResult.url,
                service_name: service.name_en,
                date: format(bookingDay, "yyyy-MM-dd"),
                start_time: cleanStartTime,
                end_time: endTime,
                expires_in_minutes: 30,
                provider,
            }
        );
    } catch (emailErr: any) {
        console.error("[Email] Failed to send paymentLinkSent:", emailErr?.message);
    }
};

export const sendConfirmationEmail = async (booking: any) => {
    const providerLabel = booking.paymentIntentId
        ? "STRIPE"
        : booking.tabbyPaymentId
            ? "TABBY"
            : "TAMARA";

    const formattedDate = format(new Date(booking.date), "yyyy-MM-dd");
    const subject = `Booking Confirmed — ${booking.service.name_en} on ${formattedDate}`;

    let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
    if (booking.paymentIntentId) {
        try {
            const receiptUrl = await getStripeReceiptUrl(booking.paymentIntentId);
            if (receiptUrl) {
                const response = await fetch(receiptUrl);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    attachments = [{
                        filename: "payment-receipt.pdf",
                        content: Buffer.from(arrayBuffer),
                        contentType: "application/pdf",
                    }];
                }
            }
        } catch (pdfErr: any) {
            console.error("[Email] Failed to fetch Stripe receipt PDF — sending without attachment:", pdfErr?.message);
        }
    }

    try {
        await sendEmailWithTemplate(
            booking.clientEmail,
            subject,
            "bookingConfirmed",
            {
                name: booking.name,
                service_name: booking.service.name_en,
                date: formattedDate,
                start_time: booking.startTime,
                end_time: booking.endTime,
                meet_link: booking.meetLink || null,
                calendar_url: booking.calendarUrl || null,
                total_amount: String(booking.totalAmount),
                provider: providerLabel,
            },
            attachments
        );
    } catch (emailErr: any) {
        console.error("[Email] Failed to send bookingConfirmed:", emailErr?.message);
    }
};

export const sendCancellationEmail = async (booking: any, result: any) => {
    const providerLabel = detectProvider(booking) || "TAMARA";

    const serviceName = booking.service?.name_en || "";
    const subject = `Your booking has been cancelled — ${serviceName}`;

    let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
    if (booking.paymentIntentId && result?.status === "refunded") {
        try {
            const receiptUrl = await getStripeReceiptUrl(booking.paymentIntentId);
            if (receiptUrl) {
                const response = await fetch(receiptUrl);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    attachments = [{
                        filename: "refund-receipt.pdf",
                        content: Buffer.from(arrayBuffer),
                        contentType: "application/pdf",
                    }];
                }
            }
        } catch (pdfErr: any) {
            console.error("[Email] Failed to fetch Stripe refund receipt PDF — sending without attachment:", pdfErr?.message);
        }
    }

    try {
        await sendEmailWithTemplate(
            booking.clientEmail,
            subject,
            "bookingCancelled",
            {
                name: booking.name,
                service_name: serviceName,
                date: format(new Date(booking.date), "yyyy-MM-dd"),
                start_time: booking.startTime,
                end_time: booking.endTime,
                payment_status: result?.status ?? "cancelled",
                total_amount: String(booking.totalAmount),
                provider: providerLabel,
            },
            attachments
        );
    } catch (emailErr: any) {
        console.error("[Email] Failed to send bookingCancelled:", emailErr?.message);
    }
};
