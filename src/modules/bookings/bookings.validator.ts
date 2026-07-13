import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { AvailabilityEngine } from "../availability/index.js";
import { addMinutes, parse, format, startOfDay, isToday, isBefore } from "date-fns";

const availabilityEngine = new AvailabilityEngine();

export class BookingValidator {

    static async validateCreateBooking(payload: any): Promise<{
        bookingDay: Date | null;
        cleanStartTime: string | null;
        endTime: string | null;
        service: any;
    }> {
        const { serviceId, date, startTime, endTime: providedEndTime } = payload;

        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new AppResponse(false, "SERVICE_NOT_FOUND", null, 404);

        // Installment-plan services are booked without a scheduled date/time — skip every
        // date/working-hours/slot check. "Installment" is derived from the service itself,
        // never trusted from the client payload.
        if (service.isInstallmentPlans) {
            return { bookingDay: null, cleanStartTime: null, endTime: null, service };
        }

        // Non-installment services require both a date and a start time.
        if (!date || !startTime) {
            throw new AppResponse(false, "DATE_AND_TIME_REQUIRED", null, 400);
        }

        const bookingDate = new Date(date);
        if (isNaN(bookingDate.getTime())) {
            throw new AppResponse(false, "INVALID_DATE", null, 400);
        }

        const bookingDay = startOfDay(bookingDate);
        const today = startOfDay(new Date());

        if (isBefore(bookingDay, today)) {
            throw new AppResponse(false, "DATE_IN_PAST", null, 400);
        }

        let cleanStartTime = startTime;
        if (cleanStartTime.includes(".")) {
            cleanStartTime = cleanStartTime.split(".")[0];
        }
        if (cleanStartTime.split(":").length > 2) {
            const parts = cleanStartTime.split(":");
            cleanStartTime = `${parts[0]}:${parts[1]}`;
        }

        let cleanEndTime = providedEndTime;
        if (!cleanEndTime) {
            cleanEndTime = format(
                addMinutes(parse(cleanStartTime, "HH:mm", bookingDate), 60),
                "HH:mm"
            );
        } else {
            if (cleanEndTime.includes(".")) cleanEndTime = cleanEndTime.split(".")[0];
            if (cleanEndTime.split(":").length > 2) {
                const parts = cleanEndTime.split(":");
                cleanEndTime = `${parts[0]}:${parts[1]}`;
            }
        }

        if (cleanEndTime <= cleanStartTime) {
            throw new AppResponse(false, "INVALID_TIME_RANGE", null, 400);
        }

        const endTime = cleanEndTime;

        if (isToday(bookingDate)) {
            const now = new Date();
            const bookingDateTime = parse(cleanStartTime, "HH:mm", bookingDate);
            if (isBefore(bookingDateTime, now)) {
                throw new AppResponse(false, "TIME_IN_PAST", null, 400);
            }
        }

        const isFullyBlocked = await availabilityEngine.isDayFullyBlocked(bookingDate);
        if (isFullyBlocked) {
            throw new AppResponse(false, "DAY_FULLY_BLOCKED", null, 400);
        }

        const workingHours = await availabilityEngine.getWorkingHours(bookingDate);

        if (workingHours.startTime === "00:00" && workingHours.endTime === "00:00") {
            throw new AppResponse(false, "SERVICE_CLOSED", null, 400);
        }

        if (cleanStartTime < workingHours.startTime || endTime > workingHours.endTime) {
            throw new AppResponse(false, "TIME_OUTSIDE_WORKING_HOURS", null, 400);
        }

        const isBlocked = await availabilityEngine.isSlotBlocked(bookingDate, cleanStartTime, endTime);
        if (isBlocked) {
            throw new AppResponse(false, "SLOT_BLOCKED", null, 400);
        }

        return { bookingDay, cleanStartTime, endTime, service };
    }


    static async validateBookingExists(id: string) {
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: { service: true, customer: true },
        });
        if (!booking) throw new AppResponse(false, "BOOKING_NOT_FOUND", null, 404);
        return booking;
    }


    static validateConfirmable(booking: any): void {
        if (booking.status === "CANCELLED") {
            throw new AppResponse(false, "CANNOT_CONFIRM_CANCELLED_BOOKING", null, 400);
        }
    }


    static validateDateRange(startDateStr: string, endDateStr: string): {
        startDate: Date;
        endDate: Date;
    } {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new AppResponse(false, "INVALID_DATE_RANGE", null, 400);
        }

        return { startDate, endDate };
    }
}