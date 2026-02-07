import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { startOfDay } from "date-fns";

export class HolidaysService {
    async createHoliday(payload: { date: string | Date; name: string; startTime?: string; endTime?: string }) {
        const dateObj = new Date(payload.date);
        if (isNaN(dateObj.getTime())) {
            throw new AppError("Invalid date provided", 400, "INVALID_DATE");
        }

        const normalizedDate = startOfDay(dateObj);

        // Normalize times
        let newStart = payload.startTime || "00:00";
        let newEnd = payload.endTime || "23:59";

        // Validate times
        if (newStart >= newEnd) {
            throw new AppError("Start time must be before end time", 400, "INVALID_TIME_RANGE");
        }

        const existingHolidays = await prisma.holiday.findMany({
            where: { date: normalizedDate },
        });

        // Check for overlaps
        for (const holiday of existingHolidays) {
            const hStart = holiday.startTime || "00:00";
            const hEnd = holiday.endTime || "23:59";

            if (newStart < hEnd && newEnd > hStart) {
                throw new AppError(`Time slot overlaps with existing holiday: ${holiday.name}`, 409, "HOLIDAY_OVERLAP");
            }
        }

        return await prisma.holiday.create({
            data: {
                date: normalizedDate,
                name: payload.name,
                startTime: payload.startTime,
                endTime: payload.endTime
            },
        });
    }

    async getHolidays() {
        return await prisma.holiday.findMany({
            orderBy: { date: "asc" },
        });
    }

    async deleteHoliday(id: string) {
        const existingHoliday = await prisma.holiday.findUnique({ where: { id } });
        if (!existingHoliday) {
            throw new AppError("Holiday not found", 404, "HOLIDAY_NOT_FOUND");
        }

        return await prisma.holiday.delete({
            where: { id },
        });
    }
}
