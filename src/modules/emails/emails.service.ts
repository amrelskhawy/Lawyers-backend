import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { format } from "date-fns";

export class EmailService {
    async sendConfirmationEmail(booking: any) {
        if (!booking.customer?.email) return;
        await sendEmailWithTemplate(
            booking.customer.email,
            "Booking Confirmation",
            "bookingConfirmation",
            {
                // Installment-plan bookings have no scheduled date/time.
                isInstallmentPlan: !!booking.isInstallmentPlan,
                serviceName: booking.service.name_en,
                date: booking.date ? format(new Date(booking.date), "yyyy-MM-dd") : "Installment plan",
                startTime: booking.startTime || "—",
                endTime: booking.endTime || "—",
                meetLink: booking.meetLink || "Link to be sent later",
                calendarUrl: booking.calendarUrl || "#"
            }
        );
    }
}
