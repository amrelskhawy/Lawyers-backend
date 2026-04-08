import nodemailer from 'nodemailer';
import logger from '../../../core/utils/logger.js';

// Types
export type DeliveryChannel = 'email' | 'sms' | 'whatsapp';

export interface DeliveryPayload {
  channel: DeliveryChannel;
  destination: string; // email address OR phone number
  reportId: string;
  previewUrl: string;
  clientName: string;
  pdfPath?: string; // local filesystem path for email attachment
}


// Email delivery
async function sendViaEmail(payload: DeliveryPayload): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const reportLink = `${process.env.APP_BASE_URL}${payload.previewUrl}`;

  await transporter.sendMail({
    from: `"شركة سعد البقمي" <${process.env.EMAIL_USER}>`,
    to: payload.destination,
    subject: 'تقرير جلستك القانونية — شركة سعد البقمي',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <div style="background: #1a1f4e; padding: 24px; text-align: center;">
          <h1 style="color: #c9a84c; margin: 0;">شركة سعد البقمي</h1>
          <p style="color: #fff; margin: 4px 0 0;">للمحاماة والاستشارات القانونية</p>
        </div>
        <div style="padding: 24px; background: #fff;">
          <p style="font-size: 16px; color: #1a1f4e;">عزيزنا <strong>${payload.clientName}</strong>،</p>
          <p style="color: #333; line-height: 1.8;">
            يسعدنا إعلامكم بأن تقرير جلستكم القانونية قد تم إعداده وهو جاهز للاطلاع.
          </p>
          ${payload.pdfPath ? `
          <p style="color: #555; font-size: 13px; text-align: center; margin-top: 0;">
            📎 التقرير مرفق بهذا البريد الإلكتروني
          </p>` : `
          <div style="text-align: center; margin: 28px 0;">
            <a href="${reportLink}"
               style="background: #1a1f4e; color: #c9a84c; text-decoration: none;
                      padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: bold;">
              عرض التقرير
            </a>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center;">
            إذا كان الرابط لا يعمل، يمكنكم نسخ هذا الرابط:<br />
            <span style="color: #1a1f4e;">${reportLink}</span>
          </p>`}
        </div>
        <div style="background: #1a1f4e; padding: 14px; text-align: center;">
          <p style="color: #c9a84c; margin: 0; font-size: 12px;">
            يرجي إرفاق النموذج مع نموذج الضبط وتسليمه للقسم المسؤول
          </p>
        </div>
      </div>
    `,
    attachments: payload.pdfPath
      ? [{
        filename: `تقرير-جلسة-${payload.clientName}.pdf`,
        path: payload.pdfPath,
        contentType: 'application/pdf',
      }]
      : [],
  });

  logger.info(`Report ${payload.reportId} delivered via email to ${payload.destination}`);
}


// SMS delivery 
// Recommended providers for Saudi Arabia:
//   • Unifonic  — https://www.unifonic.com
//   • Taqnyat   — https://www.taqnyat.sa
//   • Twilio    — https://www.twilio.com
//
// Steps to activate:
//   1. Choose a provider and create an account
//   2. Add credentials to .env (SMS_API_KEY, SMS_SENDER_ID, etc.)
//   3. Install the provider SDK (e.g. `npm install twilio`)
//   4. Replace the TODO block below with the actual API call
//
async function sendViaSMS(payload: DeliveryPayload): Promise<void> {
  const reportLink = `${process.env.APP_BASE_URL}${payload.previewUrl}`;
  const message = `شركة سعد البقمي: تقرير جلستك جاهز للاطلاع. ${reportLink}`;

  // TODO: Replace with your provider SDK call
  // Example with Twilio:
  //
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   body: message,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to: payload.destination,
  // });

  logger.warn(`[SMS STUB] Would send to ${payload.destination}: ${message}`);
  throw new Error('SMS provider not yet configured. See delivery.service.ts for instructions.');
}


// WhatsApp delivery  
//
// Recommended providers:
//   • Twilio WhatsApp — https://www.twilio.com/whatsapp
//   • 360dialog     — https://www.360dialog.com
//   • Unifonic       — supports WhatsApp Business API
//
// Steps to activate:
//   1. Get WhatsApp Business API access via your chosen provider
//   2. Add credentials to .env (WHATSAPP_API_KEY, WHATSAPP_PHONE_ID, etc.)
//   3. Replace the TODO block below with the actual API call
//
async function sendViaWhatsApp(payload: DeliveryPayload): Promise<void> {
  const reportLink = `${process.env.APP_BASE_URL}${payload.previewUrl}`;
  const message = `مرحباً ${payload.clientName}،\n\nتقرير جلستك القانونية جاهز:\n${reportLink}\n\n— شركة سعد البقمي`;

  // TODO: Replace with your provider SDK call
  // Example with Twilio WhatsApp:
  //
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({
  //   body: message,
  //   from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
  //   to: `whatsapp:${payload.destination}`,
  // });

  logger.warn(`[WhatsApp STUB] Would send to ${payload.destination}: ${message}`);
  throw new Error('WhatsApp provider not yet configured. See delivery.service.ts for instructions.');
}


export async function deliverReport(payload: DeliveryPayload): Promise<void> {
  switch (payload.channel) {
    case 'email':
      return sendViaEmail(payload);
    case 'sms':
      return sendViaSMS(payload);
    case 'whatsapp':
      return sendViaWhatsApp(payload);
    default:
      throw new Error(`Unknown delivery channel: ${payload.channel}`);
  }
}
