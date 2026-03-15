import { parse, format, isBefore, addMinutes, isAfter } from "date-fns";
import { SlotStatus, DetailedTimeSlot } from "./availability.engine.js";

export class AvailabilitySlots {
    private readonly DEFAULT_SLOT_DURATION = 60;

    generateSlots(
        startTime: string,
        endTime: string,
        date: Date,
        durationMinutes: number
    ): { start: string; end: string }[] {
        const slots: { start: string; end: string }[] = [];
        let current = parse(startTime, "HH:mm", date);
        const end = parse(endTime, "HH:mm", date);

        while (
            isAfter(end, addMinutes(current, durationMinutes)) ||
            end.getTime() === addMinutes(current, durationMinutes).getTime()
        ) {
            const slotEnd = addMinutes(current, durationMinutes);
            slots.push({
                start: format(current, "HH:mm"),
                end: format(slotEnd, "HH:mm"),
            });
            current = slotEnd;
        }

        return slots;
    }

    calculateDailySlotStatuses(
        slots: DetailedTimeSlot[],
        date: Date,
        holidayBlocks: any[],
        existingBookings: { date: Date; startTime: string; endTime: string }[]
    ): DetailedTimeSlot[] {
        const now = new Date();
        
        // 1. Mark past slots
        slots.forEach(slot => {
            const slotDateTime = parse(
                `${format(date, "yyyy-MM-dd")} ${slot.startTime}`,
                "yyyy-MM-dd HH:mm",
                new Date()
            );
            if (isBefore(slotDateTime, now)) {
                slot.status = SlotStatus.PAST;
            }
        });

        // 2. Map overlapping statuses
        return slots.map(slot => {
            if (slot.status === SlotStatus.PAST) {
                return slot;
            }

            // Check holidays
            const isBlockedByHoliday = holidayBlocks.some(h => {
                if (h.isFullDay) return true;
                const hStart = h.startTime || "00:00";
                const hEnd = h.endTime || "23:59";
                return (slot.startTime < hEnd) && (slot.endTime > hStart);
            });

            if (isBlockedByHoliday) {
                return { ...slot, status: SlotStatus.BLOCKED };
            }

            // Check bookings
            const isBooked = existingBookings.some(booking => {
                return (slot.startTime < booking.endTime) && (slot.endTime > booking.startTime);
            });

            if (isBooked) {
                return { ...slot, status: SlotStatus.BOOKED };
            }

            return slot;
        });
    }

    calculateDayAvailabilitySummary(
        slots: { start: string; end: string }[],
        dayHolidays: any[],
        dayBookings: { date: Date; startTime: string; endTime: string }[]
    ): { availableCount: number; blockedCount: number } {
        let availableCount = 0;
        let blockedCount = 0;

        for (const slot of slots) {
            // Check if blocked by holiday
            const isHoliday = dayHolidays.some(h => {
                if (h.isFullDay) return true;
                const hStart = h.startTime || "00:00";
                const hEnd = h.endTime || "23:59";
                return (slot.start < hEnd) && (slot.end > hStart);
            });

            if (isHoliday) {
                blockedCount++;
                continue;
            }

            // Check if booked
            const isBooked = dayBookings.some(b => {
                return (slot.start < b.endTime) && (slot.end > b.startTime);
            });

            if (!isBooked) {
                availableCount++;
            }
        }

        return { availableCount, blockedCount };
    }
}
