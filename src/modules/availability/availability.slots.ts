import { parse, format, isBefore, addMinutes } from "date-fns";
import { SlotStatus, DetailedTimeSlot } from "./availability.engine.js";
import { parseTimeTo24h } from "../holidays/holidays.types.js";

/**
 * Checks if two time ranges overlap using "HH:mm" string comparison.
 * Works because lexicographic order matches chronological order for this format.
 */
function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA < endB && endA > startB;
}

/**
 * Converts a time string to "HH:mm" format.
 * Handles both "HH:mm" (24h) and "hh:mm AM/PM" (12h) formats.
 */
function toHHmm(time: string): string {
    const minutes = parseTimeTo24h(time);
    if (minutes === -1) return time; // already in HH:mm format
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function isBlockedByHoliday(
    slotStart: string,
    slotEnd: string,
    holidays: any[]
): boolean {
    return holidays.some(h => {
        if (h.isFullDay) return true;
        const hStart = toHHmm(h.startTime || "00:00");
        const hEnd = toHHmm(h.endTime || "23:59");
        return timeRangesOverlap(slotStart, slotEnd, hStart, hEnd);
    });
}

export class AvailabilitySlots {
    generateSlots(
        startTime: string,
        endTime: string,
        date: Date,
        durationMinutes: number
    ): { start: string; end: string }[] {
        const slots: { start: string; end: string }[] = [];
        let current = parse(startTime, "HH:mm", date);
        const end = parse(endTime, "HH:mm", date);

        let slotEnd = addMinutes(current, durationMinutes);
        while (slotEnd <= end) {
            slots.push({
                start: format(current, "HH:mm"),
                end: format(slotEnd, "HH:mm"),
            });
            current = slotEnd;
            slotEnd = addMinutes(current, durationMinutes);
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

        return slots.map(slot => {
            const slotDateTime = parse(
                `${format(date, "yyyy-MM-dd")} ${slot.startTime}`,
                "yyyy-MM-dd HH:mm",
                new Date()
            );

            if (isBefore(slotDateTime, now)) {
                return { ...slot, status: SlotStatus.PAST };
            }

            if (isBlockedByHoliday(slot.startTime, slot.endTime, holidayBlocks)) {
                return { ...slot, status: SlotStatus.BLOCKED };
            }

            const isBooked = existingBookings.some(booking =>
                timeRangesOverlap(slot.startTime, slot.endTime, booking.startTime, booking.endTime)
            );

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
            if (isBlockedByHoliday(slot.start, slot.end, dayHolidays)) {
                blockedCount++;
                continue;
            }

            const isBooked = dayBookings.some(b =>
                timeRangesOverlap(slot.start, slot.end, b.startTime, b.endTime)
            );

            if (!isBooked) {
                availableCount++;
            }
        }

        return { availableCount, blockedCount };
    }
}
