import { startOfDay, endOfDay, addMinutes, format, isSameDay, parse, isAfter } from "date-fns";
import prisma from "../../core/db/prisma.js";

interface TimeSlot {
    startTime: string;
    endTime: string;
    available: boolean;
}

export class AvailabilityEngine {
    public async isHoliday(date: Date): Promise<boolean> {
        const holiday = await prisma.holiday.findUnique({
            where: { date: startOfDay(date) },
        });
        return !!holiday;
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
        // 1. Check if it's a holiday
        if (await this.isHoliday(date)) {
            return [];
        }

        // 2. Get working hours
        const workingHours = await this.getWorkingHours(date);
        if (!workingHours) {
            return [];
        }

        // 3. Generate all possible slots
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

        // 4. Filter out reserved slots
        const existingBookings = await this.getExistingBookings(date);

        return slots.map(slot => {
            const isBooked = existingBookings.some(booking => {
                // Simple overlap check logic: 
                // (SlotStart < BookingEnd) && (SlotEnd > BookingStart)
                return (slot.startTime < booking.endTime) && (slot.endTime > booking.startTime);
            });
            return { ...slot, available: !isBooked };
        });
    }
}
