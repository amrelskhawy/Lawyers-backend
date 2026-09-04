/**
 * One-off repair for the calendar-date timezone bug: PrimeNG date pickers used
 * to hand back local midnight, which `.toISOString()` then shifted back by the
 * browser's UTC offset before saving — so "1 Sept" picked in Asia/Riyadh
 * (UTC+3) was stored as 2026-08-31T21:00:00.000Z instead of
 * 2026-09-01T00:00:00.000Z. The app-side bug is fixed (see
 * frontend/src/app/core/utils/date-format.ts); this repairs rows saved before
 * that fix.
 *
 * Every corrupted value has exactly 21:00:00.000 UTC as its time component
 * (Saudi Arabia has no DST, so the 3h offset is constant), which a genuine
 * calendar-date-at-UTC-midnight value can never have — so it's a safe,
 * unambiguous filter. Adding 3 hours moves each corrupted row back onto UTC
 * midnight of the day the user actually picked.
 *
 * Usage:
 *   npx tsx src/scripts/fixCalendarDateTimezoneShift.ts            # dry run, reports counts
 *   npx tsx src/scripts/fixCalendarDateTimezoneShift.ts --apply    # applies the fix
 */

import "dotenv/config";
import prisma from "../core/db/prisma.js";

const TARGETS = [
    { table: "Case", column: "caseDate" },
    { table: "SessionReport", column: "sessionDate" },
    { table: "FieldVisitReport", column: "reviewDate" },
    { table: "LawyerFeesContract", column: "contractDate" },
    { table: "ContractPayment", column: "paidAt" },
    { table: "Task", column: "dueDate" },
] as const;

async function main() {
    const apply = process.argv.includes("--apply");

    for (const { table, column } of TARGETS) {
        const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
            `SELECT count(*)::bigint AS count FROM "${table}"
             WHERE "${column}" IS NOT NULL
               AND EXTRACT(HOUR FROM "${column}" AT TIME ZONE 'UTC') = 21
               AND EXTRACT(MINUTE FROM "${column}" AT TIME ZONE 'UTC') = 0
               AND EXTRACT(SECOND FROM "${column}" AT TIME ZONE 'UTC') = 0`,
        );

        if (!apply) {
            console.log(`${table}.${column}: ${count} row(s) would be shifted forward 3h`);
            continue;
        }

        const updated = await prisma.$executeRawUnsafe(
            `UPDATE "${table}"
             SET "${column}" = "${column}" + INTERVAL '3 hours'
             WHERE "${column}" IS NOT NULL
               AND EXTRACT(HOUR FROM "${column}" AT TIME ZONE 'UTC') = 21
               AND EXTRACT(MINUTE FROM "${column}" AT TIME ZONE 'UTC') = 0
               AND EXTRACT(SECOND FROM "${column}" AT TIME ZONE 'UTC') = 0`,
        );
        console.log(`${table}.${column}: fixed ${updated} row(s)`);
    }

    if (!apply) {
        console.log("\nDry run only — re-run with --apply to write these changes.");
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
