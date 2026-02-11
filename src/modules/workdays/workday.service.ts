import z from "zod";
import prisma from "../../core/db/prisma.js";
import { WorkdaysSchema } from "./workday.types.js";


export class DaysService {
    async createWorkingDays() {
        // seed data for working days
        const workingDays = await prisma.workingDay.createMany({
            data:
                ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => ({
                    day,
                    isOpen: true,
                    startTime: "09:00",
                    endTime: "17:00",
                })),
        });
        return workingDays;
    }

    async getWorkingDays() {
        const workingDays = await prisma.workingDay.findMany();
        return workingDays;
    }

    async updateWorkingDays(payload: z.infer<typeof WorkdaysSchema>) {
        // 1. Format the data into a string for the SQL VALUES list
        // Note: Ensure your DB uses "day" as a unique identifier
        const values = payload.map(
            (d) => `('${d.day}', ${d.isOpen}, '${d.startTime}', '${d.endTime}')`
        ).join(", ");

        // 2. Execute a single bulk update query
        // This syntax works specifically for PostgreSQL. 
        await prisma.$executeRawUnsafe(`
                UPDATE "WorkingDay" AS w
                SET 
                "isOpen" = v."isOpen",
                "startTime" = v."startTime",
                "endTime" = v."endTime"
                FROM (VALUES ${values}) AS v("day", "isOpen", "startTime", "endTime")
                WHERE w."day" = v."day";
            `);

        return this.getWorkingDays();
    }

}
