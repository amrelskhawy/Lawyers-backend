import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "./availability.engine.js";
import { format, startOfDay } from "date-fns";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { PaymentService } from "../payment/payment.service.js";
import { PaymentFactory } from "../payment/payment.factory.js";
import { StripeProvider } from "../payment/providers/stripe/stripe.provider.js";
import { BookingValidator } from "./bookings.validator.js";
import { createMeetLink } from "../../core/services/google/meeting.js";
import { createGoogleEvent } from "../../core/services/google/calendar.js";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleService } from "@app/core/services/google/service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BookingService {
    private availabilityEngine: AvailabilityEngine;
    private paymentService: PaymentService;

    constructor() {
        this.availabilityEngine = new AvailabilityEngine();
        this.paymentService = new PaymentService();
    }


    async createBooking(payload: any) {
        const { clientEmail } = payload;

        const { bookingDay, cleanStartTime, endTime, service } =
            await BookingValidator.validateCreateBooking(payload);

        const stripeProvider = PaymentFactory.getProvider("STRIPE") as StripeProvider;

        const customer = await stripeProvider.checkCustomerEmail(clientEmail) || await stripeProvider.createCustomer(clientEmail, payload.name);

        const paymentResult = await this.paymentService.createPayment(
            customer.id,
            service.price as any,
            {
                serviceId: payload.serviceId,
                clientEmail,
                name: payload.name,
                phone: payload.phone_number,
                date: format(bookingDay, "yyyy-MM-dd"),
                startTime: cleanStartTime,
                endTime,
                totalAmount: String(service.price),
            },
            "STRIPE"
        );


        if (!paymentResult || !paymentResult.url) {
            throw new AppResponse(false, "PAYMENT_LINK_CREATION_FAILED", null, 500);
        }

        // No booking saved yet — it gets created in the webhook after payment
        return { payment_link: paymentResult.url };
    }

    async confirmBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);
        if (booking.status === "CONFIRMED") return booking;
        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "CANNOT_CONFIRM_CANCELLED_BOOKING", null, 400);
        }

        if (booking.paymentIntentId) {
            await this.paymentService.capture(id, "STRIPE");
        }

        try {
            // 1. Create Meet link via Meet REST API (best-effort)
            const meetLink = await createMeetLink();

            // 2. Create Google Calendar Event with the Meet link attached
            const { calendarUrl } = await createGoogleEvent(booking, booking.service.name_en, meetLink);

            // 2. Update Booking with Links & Status
            const updatedBooking = await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    meetLink,
                    status: "CONFIRMED",
                    paymentStatus: "PAID",
                },
                include: { service: true },
            });

            // 3. Send Confirmation Email
            // await this.sendConfirmationEmail(updatedBooking);

            return updatedBooking;

        } catch (error: any) {
            // Surface the real root-cause message for easier debugging
            const msg = error?.cause?.message ?? error?.response?.data?.error?.message ?? error?.message ?? "Unknown error";
            console.error("Booking confirmation failed:", msg);
            throw new AppResponse(false, "BOOKING_CONFIRMATION_FAILED", null, 500);
        }
    }

    private async sendConfirmationEmail(booking: any) {
        await sendEmailWithTemplate(
            booking.clientEmail,
            "Booking Confirmation",
            "bookingConfirmation",
            {
                serviceName: booking.service.name_en,
                date: format(new Date(booking.date), "yyyy-MM-dd"),
                startTime: booking.startTime,
                endTime: booking.endTime,
                meetLink: booking.meetLink || "Link to be sent later",
                calendarUrl: booking.calendarUrl || "#"
            }
        );
    }

    async getAllBookings() {
        return await prisma.booking.findMany({
            include: { service: true },
            orderBy: { date: "desc" },
        });
    }

    async completeBooking(id: string) {
        await BookingValidator.validateBookingExists(id);

        return await prisma.booking.update({
            where: { id },
            data: { status: "COMPLETED" },
            include: { service: true }
        });
    }

    async cancelBooking(id: string) {
        const booking = await BookingValidator.validateBookingExists(id);

        if (booking.paymentIntentId) {
            return await this.paymentService.cancel(id, "STRIPE");
        }

        return await prisma.booking.update({
            where: { id },
            data: { status: "CANCELLED" },
            include: { service: true }
        });
    }

    async getBookingMetadata(startDateStr: string, endDateStr: string) {
        const { startDate, endDate } = BookingValidator.validateDateRange(
            startDateStr,
            endDateStr
        );

        // 1. Get Working Days configuration (optional - may be empty)
        const workingDays = await prisma.workingDay.findMany({
            orderBy: {
                day: 'asc'
            }
        });

        // 2. Get Holidays in Range
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: startOfDay(startDate),
                    lte: startOfDay(endDate)
                }
            }
        });

        // 3. Get Booked Dates
        const bookings = await prisma.booking.findMany({
            where: {
                date: {
                    gte: startOfDay(startDate),
                    lte: startOfDay(endDate)
                },
                status: {
                    not: "CANCELLED"
                }
            },
            select: {
                date: true
            }
        });

        const bookedDates = Array.from(new Set(bookings.map(b => format(b.date, "yyyy-MM-dd"))));

        return {
            workingDays: workingDays.length > 0 ? workingDays : [{
                day: "DEFAULT",
                isOpen: true,
                startTime: "09:00",
                endTime: "17:00"
            }],
            holidays: holidays.map((h: any) => ({
                date: format(h.date, "yyyy-MM-dd"),
                name: h.name,
                startTime: h.startTime,
                endTime: h.endTime,
                isFullDay: h.isFullDay
            })),
            bookedDates
        };
    }
}