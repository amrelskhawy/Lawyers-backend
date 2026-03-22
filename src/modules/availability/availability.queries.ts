import prisma from "../../core/db/prisma.js";
import { startOfDay, endOfDay } from "date-fns";

export class AvailabilityQueries {
    private readonly FALLBACK_START_TIME = "09:00";
    private readonly FALLBACK_END_TIME = "17:00";

    private readonly DAY_NAMES = [
        "Sunday", "Monday", "Tuesday",
        "Wednesday", "Thursday", "Friday", "Saturday"
    ];

    private readonly CLOSED_SIGNAL = { startTime: "00:00", endTime: "00:00" };

    async getHolidayBlocks(date: Date) {
        return await prisma.holiday.findMany({
            where: { date: startOfDay(date) }
        });
    }

    async getExistingBookings(date: Date): Promise<{ date: Date; startTime: string; endTime: string }[]> {
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
            select: {
                date: true,
                startTime: true,
                endTime: true,
            }
        });
        return bookings;
    }

    async getWorkingHours(date: Date): Promise<{ startTime: string; endTime: string }> {
        const dayOfWeek = this.DAY_NAMES[date.getDay()];

        // Try to get configured working hours
        const workingDay = await prisma.workingDay.findUnique({
            where: { day: dayOfWeek },
        });

        if (!workingDay) {
            console.warn(`[AvailabilityQueries] Missing WorkingDay config for "${dayOfWeek}". Using fallback.`);
            return { startTime: this.FALLBACK_START_TIME, endTime: this.FALLBACK_END_TIME };
        }

        if (!workingDay.isOpen) {
            return this.CLOSED_SIGNAL;
        }

        return {
            startTime: workingDay.startTime ?? this.FALLBACK_START_TIME,
            endTime: workingDay.endTime ?? this.FALLBACK_END_TIME,
        };
    }

    async getWorkingDaysConfig() {
        return await prisma.workingDay.findMany();
    }

    resolveWorkingHoursFromConfig(
        date: Date,
        config: any[]
    ): { startTime: string; endTime: string } {
        const dayOfWeek = this.DAY_NAMES[date.getDay()];
        const workingDay = config.find((d: any) => d.day === dayOfWeek);

        if (!workingDay) {
            return { startTime: this.FALLBACK_START_TIME, endTime: this.FALLBACK_END_TIME };
        }

        if (!workingDay.isOpen) {
            return this.CLOSED_SIGNAL;
        }

        return {
            startTime: workingDay.startTime ?? this.FALLBACK_START_TIME,
            endTime: workingDay.endTime ?? this.FALLBACK_END_TIME,
        };
    }

    async getMonthHolidays(start: Date, end: Date) {
        return await prisma.holiday.findMany({
            where: {
                date: { gte: start, lte: end }
            }
        });
    }

    async getMonthBookings(start: Date, end: Date): Promise<{ date: Date; startTime: string; endTime: string }[]> {
        return await prisma.booking.findMany({
            where: {
                date: { gte: start, lte: end },
                status: { not: "CANCELLED" }
            },
            select: {
                date: true,
                startTime: true,
                endTime: true,
            }
        });
    }
}
