import prisma from "../../core/db/prisma.js";
import { AppError } from "../../core/utils/AppError.js";
import { startOfDay } from "date-fns";

export class HolidaysService {
    async createHoliday(payload: { date: string | Date; name: string }) {
        const dateObj = new Date(payload.date);
        if (isNaN(dateObj.getTime())) {
            throw new AppError("Invalid date provided", 400, "INVALID_DATE");
        }

        const normalizedDate = startOfDay(dateObj);

        const existingHoliday = await prisma.holiday.findUnique({
            where: { date: normalizedDate },
        });

        if (existingHoliday) {
            throw new AppError("A holiday already exists on this date", 409, "HOLIDAY_EXISTS");
        }

        return await prisma.holiday.create({
            data: {
                date: normalizedDate,
                name: payload.name,
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
