/**
 * Money helpers for the fees-contract / financials layer.
 *
 * Prisma returns `Decimal` for money columns, which serialises to a string over
 * JSON. The API always hands the frontend plain numbers rounded to 2 decimals,
 * so no client ever has to know Decimal exists.
 */
import { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/** Read a money column as a number. Null/blank/unparseable all read as 0. */
export function toAmount(value: DecimalLike): number {
    if (value === null || value === undefined || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? round2(n) : 0;
}

/** Round to 2 decimals, avoiding the usual float drift on sums. */
export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum a list of money columns as a number. */
export function sumAmounts(values: DecimalLike[]): number {
    return round2(values.reduce<number>((acc, v) => acc + toAmount(v), 0));
}
