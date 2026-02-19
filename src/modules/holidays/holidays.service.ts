import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { startOfDay, format } from "date-fns";
import { HolidayPayload } from "./holidays.types.js";
import { appEvents, SystemEvents } from "../../core/utils/events.js";

export class HolidaysService {
    async createHoliday(payload: HolidayPayload) {
        const dateObj = new Date(payload.date);
        if (isNaN(dateObj.getTime())) {
            throw new AppResponse(false, "INVALID_DATE", null, 400);
        }

        const normalizedDate = startOfDay(dateObj);

        // Prevent past holidays
        const today = startOfDay(new Date());
        if (normalizedDate < today) {
            throw new AppResponse(false, "DATE_IN_PAST", null, 400);
        }

        // Determine isFullDay
        let isFullDay = payload.isFullDay || false;
        if (!payload.startTime && !payload.endTime) {
            isFullDay = true;
        }

        let newStart: string | null | undefined = payload.startTime;
        let newEnd: string | null | undefined = payload.endTime;

        if (isFullDay) {
            newStart = null;
            newEnd = null;
        } else {
            newStart = newStart || "00:00";
            newEnd = newEnd || "23:59";

            if (newStart >= newEnd) {
                throw new AppResponse(false, "INVALID_TIME_RANGE", null, 400);
            }
        }

        const existingHolidays = await prisma.holiday.findMany({
            where: { date: normalizedDate },
        });

        // Check for overlaps
        for (const holiday of existingHolidays) {
            if (holiday.isFullDay || isFullDay) {
                throw new AppResponse(false, "HOLIDAY_FULL_DAY_EXISTS", null, 409);
            }

            const hStart = holiday.startTime || "00:00";
            const hEnd = holiday.endTime || "23:59";

            const nStart = newStart || "00:00";
            const nEnd = newEnd || "23:59";

            if (nStart < hEnd && nEnd > hStart) {
                throw new AppResponse(false, "HOLIDAY_OVERLAP", null, 409);
            }
        }

        const holiday = await prisma.holiday.create({
            data: {
                date: normalizedDate,
                name: payload.name,
                startTime: newStart,
                endTime: newEnd,
                isFullDay
            },
        });

        appEvents.emitDataChange(SystemEvents.HOLIDAY_CREATED, { holidayId: holiday.id });

        return {
            ...holiday,
            date: format(holiday.date, "yyyy-MM-dd")
        };
    }

    async getHolidaysByRange(startDate: Date, endDate: Date) {
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: startOfDay(startDate),
                    lte: startOfDay(endDate),
                },
            },
            orderBy: { date: "asc" },
        });

        return holidays.map(h => ({
            ...h,
            date: format(h.date, "yyyy-MM-dd")
        }));
    }

    async getHolidays() {
        const holidays = await prisma.holiday.findMany({
            orderBy: { date: "asc" },
        });

        return holidays.map(h => ({
            ...h,
            date: format(h.date, "yyyy-MM-dd")
        }));
    }

    async deleteHoliday(id: string) {
        const existingHoliday = await prisma.holiday.findUnique({ where: { id } });
        if (!existingHoliday) {
            throw new AppResponse(false, "HOLIDAY_NOT_FOUND", null, 404);
        }

        const result = await prisma.holiday.delete({
            where: { id },
        });

        appEvents.emitDataChange(SystemEvents.HOLIDAY_DELETED, { holidayId: existingHoliday.id });

        return result;
    }
}
