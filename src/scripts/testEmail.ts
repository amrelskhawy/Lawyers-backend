/**
 * Test Email Script
 *
 * Usage:
 *   npx tsx src/scripts/testEmail.ts <template> <recipient>
 *
 * Templates:
 *   emailVerification, forgotPassword, bookingConfirmation,
 *   bookingConfirmed, bookingCancelled, paymentLinkSent
 *
 * Examples:
 *   npx tsx src/scripts/testEmail.ts emailVerification test@example.com
 *   npx tsx src/scripts/testEmail.ts bookingConfirmation test@example.com
 *   npx tsx src/scripts/testEmail.ts bookingCancelled test@example.com
 */

import "dotenv/config";
import { sendEmail, sendEmailWithTemplate } from "../core/utils/email.js";

const TEMPLATES: Record<string, { subject: string; context: Record<string, string> }> = {
    emailVerification: {
        subject: "Test - Verify Your Email",
        context: {
            name: "Test User",
            link: "https://example.com/verify?token=test-token-123",
            subject: "Email Verification",
        },
    },
    forgotPassword: {
        subject: "Test - Reset Your Password",
        context: {
            name: "Test User",
            link: "https://example.com/reset-password?token=test-token-123",
        },
    },
    bookingConfirmation: {
        subject: "Test - Booking Confirmation",
        context: {
            serviceName: "Legal Consultation",
            date: "2026-04-15",
            startTime: "10:00",
            endTime: "11:00",
            meetLink: "https://meet.google.com/test-meeting",
            calendarUrl: "https://calendar.google.com/test",
        },
    },
    bookingConfirmed: {
        subject: "Test - Booking Confirmed",
        context: {
            serviceName: "Legal Consultation",
            date: "2026-04-15",
            startTime: "10:00",
            endTime: "11:00",
            meetLink: "https://meet.google.com/test-meeting",
            calendarUrl: "https://calendar.google.com/test",
        },
    },
    bookingCancelled: {
        subject: "Test - Booking Cancelled",
        context: {
            name: "Test User",
            service_name: "Legal Consultation",
            date: "2026-04-15",
            start_time: "10:00",
            end_time: "11:00",
            total_amount: "150",
            provider: "Stripe",
            payment_status: "refunded",
        },
    },
    paymentLinkSent: {
        subject: "Test - Payment Link",
        context: {
            name: "Test User",
            serviceName: "Legal Consultation",
            link: "https://example.com/pay?session=test-123",
            amount: "150",
        },
    },
};

async function main() {
    const [template, recipient] = process.argv.slice(2);

    if (!template || !recipient) {
        console.log("Usage: npx tsx src/scripts/testEmail.ts <template> <recipient>");
        console.log("\nAvailable templates:");
        Object.keys(TEMPLATES).forEach((t) => console.log(`  - ${t}`));
        process.exit(1);
    }

    const config = TEMPLATES[template];
    if (!config) {
        console.error(`Unknown template: "${template}"`);
        console.log("Available templates:", Object.keys(TEMPLATES).join(", "));
        process.exit(1);
    }

    console.log(`Sending "${template}" email to ${recipient}...`);
    console.log(`SMTP: ${process.env.EMAIL_HOST} (user: ${process.env.EMAIL_USER})`);

    try {
        const info = await sendEmailWithTemplate(
            recipient,
            config.subject,
            template,
            config.context
        );
        console.log("Email sent successfully!");
        console.log("Message ID:", info.messageId);
    } catch (error) {
        console.error("Failed to send email:", error);
        process.exit(1);
    }
}

main();
