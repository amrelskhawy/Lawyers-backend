import { startOfDay, endOfDay, addMinutes, format, isSameDay, parse, isAfter } from "date-fns";
import prisma from "../../core/db/prisma.js";

interface TimeSlot {
    startTime: string;
    endTime: string;
    available: boolean;
}

export class AvailabilityEngine {
    public async getHolidayBlocks(date: Date) {
        return await prisma.holiday.findMany({
            where: { date: startOfDay(date) }
        });
    }

    public async isSlotBlocked(date: Date, startTime: string, endTime: string): Promise<boolean> {
        const holidays = await this.getHolidayBlocks(date);
        for (const h of holidays) {
            const hStart = h.startTime || "00:00";
            const hEnd = h.endTime || "23:59";
            // Check overlap
            if (startTime < hEnd && endTime > hStart) {
                return true;
            }
        }
        return false;
    }

    public async getWorkingHours(date: Date): Promise<{ startTime: string; endTime: string } | null> {
        const dayOfWeek = format(date, "EEEE").toUpperCase();
        const workingDay = await prisma.workingDay.findUnique({
            where: { day: dayOfWeek },
        });

        if (!workingDay || !workingDay.isOpen) {
            return null;
        }

        return { startTime: workingDay.startTime, endTime: workingDay.endTime };
    }

    private async getExistingBookings(date: Date): Promise<any[]> {
        const start = startOfDay(date);
        const end = endOfDay(date);

        const bookings = await prisma.booking.findMany({
            where: {
                date: {
                    gte: start,
                    lte: end,
                },
                status: {
                    not: "CANCELLED",
                },
            },
        });
        return bookings;
    }

    async getAvailableSlots(date: Date, serviceDurationMinutes: number = 60): Promise<TimeSlot[]> {
        // 1. Get working hours
        const workingHours = await this.getWorkingHours(date);
        if (!workingHours) {
            return [];
        }

        // 2. Generate all possible slots
        const slots: TimeSlot[] = [];
        let currentSlotStart = parse(workingHours.startTime, "HH:mm", date);
        const endWorkDay = parse(workingHours.endTime, "HH:mm", date);

        while (isAfter(endWorkDay, addMinutes(currentSlotStart, serviceDurationMinutes)) || endWorkDay.getTime() === addMinutes(currentSlotStart, serviceDurationMinutes).getTime()) {
            const slotEnd = addMinutes(currentSlotStart, serviceDurationMinutes);
            slots.push({
                startTime: format(currentSlotStart, "HH:mm"),
                endTime: format(slotEnd, "HH:mm"),
                available: true,
            });
            currentSlotStart = slotEnd;
        }

        // 3. Filter out reserved slots (Bookings AND Holidays)
        const existingBookings = await this.getExistingBookings(date);
        const holidayBlocks = await this.getHolidayBlocks(date);

        return slots.map(slot => {
            const isBooked = existingBookings.some(booking => {
                return (slot.startTime < booking.endTime) && (slot.endTime > booking.startTime);
            });

            const isHolidayBlocked = holidayBlocks.some(h => {
                const hStart = h.startTime || "00:00";
                const hEnd = h.endTime || "23:59";
                return (slot.startTime < hEnd) && (slot.endTime > hStart);
            });

            return { ...slot, available: !isBooked && !isHolidayBlocked };
        });
    }
}
