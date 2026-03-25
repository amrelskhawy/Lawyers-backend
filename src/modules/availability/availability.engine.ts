import { AvailabilityQueries } from "./availability.queries.js";
import { AvailabilitySlots } from "./availability.slots.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import {
    startOfDay,
    eachDayOfInterval,
    startOfMonth,
    endOfMonth,
    isBefore,
    isSameDay,
    format
} from "date-fns";
import { parseTimeTo24h } from "../holidays/holidays.types.js";

export enum SlotStatus {
    AVAILABLE = "AVAILABLE",
    BOOKED = "BOOKED",
    BLOCKED = "BLOCKED",
    PAST = "PAST",
    FULL = "FULL",
    CLOSED = "CLOSED"
}

export interface DetailedTimeSlot {
    startTime: string;
    endTime: string;
    status: SlotStatus;
}

interface TimeSlot {
    startTime: string;
    endTime: string;
    available: boolean;
}

export class AvailabilityEngine {
    private queries: AvailabilityQueries;
    private slots: AvailabilitySlots;

    constructor() {
        this.queries = new AvailabilityQueries();
        this.slots = new AvailabilitySlots();
    }

    private toHHmm(time: string): string {
        const minutes = parseTimeTo24h(time);
        if (minutes === -1) return time;
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }

    public async getHolidayBlocks(date: Date) {
        return this.queries.getHolidayBlocks(date);
    }

    public async isSlotBlocked(
        date: Date,
        startTime: string,
        endTime: string
    ): Promise<boolean> {
        const holidays = await this.getHolidayBlocks(date);

        return holidays.some(h => {
            if (h.isFullDay) return true;
            const hStart = this.toHHmm(h.startTime || "00:00");
            const hEnd = this.toHHmm(h.endTime || "23:59");
            return startTime < hEnd && endTime > hStart;
        });
    }

    public async getWorkingHours(date: Date) {
        return this.queries.getWorkingHours(date);
    }

    public async isDayFullyBlocked(date: Date): Promise<boolean> {
        const holidays = await this.queries.getHolidayBlocks(date);
        return holidays.some(h => h.isFullDay);
    }

    async getDetailedDailySlots(
        date: Date,
        serviceDurationMinutes: number = 60
    ): Promise<DetailedTimeSlot[]> {
        if (!serviceDurationMinutes || serviceDurationMinutes <= 0) {
            throw new AppResponse(false, "INVALID_SERVICE_DURATION", null, 400);
        }

        const holidayBlocks = await this.queries.getHolidayBlocks(date);
        const isFullyBlocked = holidayBlocks.some(h => h.isFullDay);
        if (isFullyBlocked) {
            return [];
        }

        const workingHours = await this.queries.getWorkingHours(date);

        if (workingHours.startTime === "00:00" && workingHours.endTime === "00:00") {
            return [];
        }

        const rawSlots = this.slots.generateSlots(
            workingHours.startTime,
            workingHours.endTime,
            date,
            serviceDurationMinutes
        );

        const detailedSlots: DetailedTimeSlot[] = rawSlots.map(s => ({
            startTime: s.start,
            endTime: s.end,
            status: SlotStatus.AVAILABLE
        }));

        const existingBookings = await this.queries.getExistingBookings(date);

        return this.slots.calculateDailySlotStatuses(
            detailedSlots,
            date,
            holidayBlocks,
            existingBookings
        );
    }

    async getMonthlyAvailability(year: number, month: number, serviceDurationMinutes: number = 60) {
        const start = startOfMonth(new Date(year, month - 1));
        const end = endOfMonth(start);
        const days = eachDayOfInterval({ start, end });
        const today = startOfDay(new Date());

        const [monthHolidays, monthBookings, workingDaysConfig] = await Promise.all([
            this.queries.getMonthHolidays(start, end),
            this.queries.getMonthBookings(start, end),
            this.queries.getWorkingDaysConfig(),
        ]);

        const results = [];

        for (const day of days) {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayStart = startOfDay(day);

            if (isBefore(dayStart, today)) {
                results.push({
                    date: dateStr,
                    status: SlotStatus.PAST,
                    availableSlots: 0,
                    isFullyBlocked: true
                });
                continue;
            }

            const dayHolidays = monthHolidays.filter(h => isSameDay(h.date, day));

            const hasFullDayHoliday = dayHolidays.some(h => h.isFullDay);
            if (hasFullDayHoliday) {
                results.push({
                    date: dateStr,
                    status: SlotStatus.BLOCKED,
                    availableSlots: 0,
                    isFullyBlocked: true
                });
                continue;
            }

            const workingHours = this.queries.resolveWorkingHoursFromConfig(day, workingDaysConfig);

            if (workingHours.startTime === "00:00" && workingHours.endTime === "00:00") {
                results.push({
                    date: dateStr,
                    status: SlotStatus.CLOSED,
                    availableSlots: 0,
                    isFullyBlocked: true
                });
                continue;
            }

            const dayBookings = monthBookings.filter(b => isSameDay(b.date, day));
            const slots = this.slots.generateSlots(workingHours.startTime, workingHours.endTime, day, serviceDurationMinutes);

            const summary = this.slots.calculateDayAvailabilitySummary(slots, dayHolidays, dayBookings);

            const totalSlots = slots.length;
            const isFullyBlocked = summary.blockedCount === totalSlots;

            results.push({
                date: dateStr,
                status: isFullyBlocked ? SlotStatus.BLOCKED : (summary.availableCount > 0 ? SlotStatus.AVAILABLE : SlotStatus.FULL),
                availableSlots: summary.availableCount,
                isFullyBlocked
            });
        }

        return results;
    }

    async getBookingMetadata(startDateStr: string, endDateStr: string) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        const [workingDays, holidays, bookings] = await Promise.all([
            this.queries.getWorkingDaysConfig(),
            this.queries.getMonthHolidays(startOfDay(startDate), startOfDay(endDate)),
            this.queries.getMonthBookings(startOfDay(startDate), startOfDay(endDate)),
        ]);

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
    }

    async getAvailableSlots(
        date: Date,
        serviceDurationMinutes: number = 60
    ): Promise<TimeSlot[]> {
        const detailed = await this.getDetailedDailySlots(date, serviceDurationMinutes);
        return detailed
            .filter(d => d.status !== SlotStatus.PAST)
            .map(d => ({
                startTime: d.startTime,
                endTime: d.endTime,
                available: d.status === SlotStatus.AVAILABLE
            }));
    }
}
