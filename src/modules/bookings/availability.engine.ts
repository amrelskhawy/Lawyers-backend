import {
    startOfDay,
    endOfDay,
    addMinutes,
    format,
    isSameDay,
    parse,
    isAfter,
    eachDayOfInterval,
    startOfMonth,
    endOfMonth,
    isBefore
} from "date-fns";
import prisma from "../../core/db/prisma.js";

interface TimeSlot {
    startTime: string;
    endTime: string;
    available: boolean;
}

export enum SlotStatus {
    AVAILABLE = "AVAILABLE",
    BOOKED = "BOOKED",
    BLOCKED = "BLOCKED",
    PAST = "PAST"
}

export interface DetailedTimeSlot {
    startTime: string;
    endTime: string;
    status: SlotStatus;
}

export class AvailabilityEngine {
    // Default working hours if no WorkingDay configuration exists
    private readonly DEFAULT_START_TIME = "00:00";
    private readonly DEFAULT_END_TIME = "23:59";

    public async getHolidayBlocks(date: Date) {
        return await prisma.holiday.findMany({
            where: { date: startOfDay(date) }
        });
    }

    public async isSlotBlocked(date: Date, startTime: string, endTime: string): Promise<boolean> {
        const holidays = await this.getHolidayBlocks(date);

        //check if entire day is blocked by a full-day holiday
        const hasFullDayHoliday = holidays.some(h => h.isFullDay);
        if (hasFullDayHoliday) {
            return true;
        }

        for (const h of holidays) {
            const hStart = h.startTime || "00:00";
            const hEnd = h.endTime || "23:59";
            // Check overlap: slot and holiday overlap if slot starts before holiday ends AND slot ends after holiday starts
            if (startTime < hEnd && endTime > hStart) {
                return true;
            }
        }
        return false;
    }

    public async getWorkingHours(date: Date): Promise<{ startTime: string; endTime: string }> {
        const dayOfWeek = format(date, "EEEE").toUpperCase();

        // Try to get configured working hours
        const workingDay = await prisma.workingDay.findUnique({
            where: { day: dayOfWeek },
        });

        // If configured and marked as closed, check if there's a full-day holiday
        if (workingDay && !workingDay.isOpen) {
            // Day is configured as closed, return default but check for holidays
            const holidays = await this.getHolidayBlocks(date);
            const hasFullDayHoliday = holidays.some(h => h.isFullDay);

            if (hasFullDayHoliday) {
                // Truly closed due to holiday
                return { startTime: "00:00", endTime: "00:00" };
            }

            // If no holiday, treat as regular day with default hours
            return {
                startTime: this.DEFAULT_START_TIME,
                endTime: this.DEFAULT_END_TIME
            };
        }

        // If configured with hours, use those
        if (workingDay && workingDay.isOpen && workingDay.startTime && workingDay.endTime) {
            return {
                startTime: workingDay.startTime,
                endTime: workingDay.endTime
            };
        }

        // Default working hours
        return {
            startTime: this.DEFAULT_START_TIME,
            endTime: this.DEFAULT_END_TIME
        };
    }

    public async isDayFullyBlocked(date: Date): Promise<boolean> {
        const holidays = await this.getHolidayBlocks(date);
        return holidays.some(h => h.isFullDay);
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

    async getDetailedDailySlots(date: Date, serviceDurationMinutes: number = 60): Promise<DetailedTimeSlot[]> {
        // Check if day is fully blocked by holiday
        const isFullyBlocked = await this.isDayFullyBlocked(date);
        if (isFullyBlocked) {
            return [];
        }

        const workingHours = await this.getWorkingHours(date);

        // If working hours are 00:00 to 00:00, day is closed
        if (workingHours.startTime === "00:00" && workingHours.endTime === "00:00") {
            return [];
        }

        const slots: DetailedTimeSlot[] = [];
        let currentSlotStart = parse(workingHours.startTime, "HH:mm", date);
        const endWorkDay = parse(workingHours.endTime, "HH:mm", date);
        const now = new Date();

        while (isAfter(endWorkDay, addMinutes(currentSlotStart, serviceDurationMinutes)) ||
            endWorkDay.getTime() === addMinutes(currentSlotStart, serviceDurationMinutes).getTime()) {
            const slotEnd = addMinutes(currentSlotStart, serviceDurationMinutes);
            const slotStartTime = format(currentSlotStart, "HH:mm");
            const slotEndTime = format(slotEnd, "HH:mm");

            // Check if slot is in the past
            const slotDateTime = parse(
                `${format(date, "yyyy-MM-dd")} ${slotStartTime}`,
                "yyyy-MM-dd HH:mm",
                new Date()
            );

            let status = SlotStatus.AVAILABLE;

            if (isBefore(slotDateTime, now)) {
                status = SlotStatus.PAST;
            }

            slots.push({
                startTime: slotStartTime,
                endTime: slotEndTime,
                status
            });
            currentSlotStart = slotEnd;
        }

        const existingBookings = await this.getExistingBookings(date);
        const holidayBlocks = await this.getHolidayBlocks(date);

        return slots.map(slot => {
            // If already marked as PAST, keep it
            if (slot.status === SlotStatus.PAST) {
                return slot;
            }

            // Check holiday blocks (high priority)
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

    async getMonthlyAvailability(year: number, month: number) {
        const start = startOfMonth(new Date(year, month - 1));
        const end = endOfMonth(start);
        const days = eachDayOfInterval({ start, end });
        const today = startOfDay(new Date());

        // Fetch all holidays and bookings for the month
        const monthHolidays = await prisma.holiday.findMany({
            where: {
                date: { gte: start, lte: end }
            }
        });

        const monthBookings = await prisma.booking.findMany({
            where: {
                date: { gte: start, lte: end },
                status: { not: "CANCELLED" }
            }
        });

        const workingDaysConfig = await prisma.workingDay.findMany();

        const results = [];

        for (const day of days) {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayOfWeek = format(day, "EEEE").toUpperCase();
            const dayStart = startOfDay(day);

            // Check if day is in the past
            if (isBefore(dayStart, today)) {
                results.push({
                    date: dateStr,
                    status: "PAST",
                    availableSlots: 0,
                    isFullyBlocked: true
                });
                continue;
            }

            const dayHolidays = monthHolidays.filter(h => isSameDay(h.date, day));

            // Check for full-day holiday
            const hasFullDayHoliday = dayHolidays.some(h => h.isFullDay);
            if (hasFullDayHoliday) {
                results.push({
                    date: dateStr,
                    status: "BLOCKED",
                    availableSlots: 0,
                    isFullyBlocked: true
                });
                continue;
            }

            // Get working hours (with defaults)
            const config = workingDaysConfig.find(wd => wd.day === dayOfWeek);
            let startTime = this.DEFAULT_START_TIME;
            let endTime = this.DEFAULT_END_TIME;

            if (config && config.isOpen && config.startTime && config.endTime) {
                startTime = config.startTime;
                endTime = config.endTime;
            } else if (config && !config.isOpen) {
                // If specifically configured as closed
                results.push({
                    date: dateStr,
                    status: "CLOSED",
                    availableSlots: 0,
                    isFullyBlocked: true
                });
                continue;
            }

            const dayBookings = monthBookings.filter(b => isSameDay(b.date, day));

            // Generate slots to count availability
            const slots = [];
            let currentSlotStart = parse(startTime, "HH:mm", day);
            const endWorkDay = parse(endTime, "HH:mm", day);
            const duration = 60; // Default service duration

            while (isAfter(endWorkDay, addMinutes(currentSlotStart, duration)) ||
                endWorkDay.getTime() === addMinutes(currentSlotStart, duration).getTime()) {
                const slotEnd = addMinutes(currentSlotStart, duration);
                slots.push({
                    start: format(currentSlotStart, "HH:mm"),
                    end: format(slotEnd, "HH:mm")
                });
                currentSlotStart = slotEnd;
            }

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

            const totalSlots = slots.length;
            const isFullyBlocked = blockedCount === totalSlots;

            results.push({
                date: dateStr,
                status: isFullyBlocked ? "BLOCKED" : (availableCount > 0 ? "AVAILABLE" : "FULL"),
                availableSlots: availableCount,
                isFullyBlocked
            });
        }

        return results;
    }

    // Legacy compatibility
    async getAvailableSlots(date: Date, serviceDurationMinutes: number = 60): Promise<TimeSlot[]> {
        const detailed = await this.getDetailedDailySlots(date, serviceDurationMinutes);
        return detailed
            .filter(d => d.status !== SlotStatus.PAST) // Exclude past slots
            .map(d => ({
                startTime: d.startTime,
                endTime: d.endTime,
                available: d.status === SlotStatus.AVAILABLE
            }));
    }
}