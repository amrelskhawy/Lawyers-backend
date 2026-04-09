import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { format } from "date-fns";

export class EmailService {
    async sendConfirmationEmail(booking: any) {
        await sendEmailWithTemplate(
            booking.customer.email,
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
}
