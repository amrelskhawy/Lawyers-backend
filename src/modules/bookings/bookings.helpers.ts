import { format } from "date-fns";

export const detectProvider = (booking: any): "STRIPE" | "TABBY" | "TAMARA" | undefined => {
    if (booking.paymentIntentId) return "STRIPE";
    if (booking.tabbyPaymentId) return "TABBY";
    if (booking.tamaraOrderId) return "TAMARA";
    return undefined;
};

export const buildMetadataResponse = (workingDays: any[], holidays: any[], bookings: any[]) => {
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
};
