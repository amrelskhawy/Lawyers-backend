import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { round2, sumAmounts, toAmount } from "../../core/utils/money.js";
import { buildMeta, parseListQuery, type PageMeta } from "../../core/utils/pagination.js";
import type { FinancialsQuery } from "./financials.validator.js";

/**
 * Where a contract's money belongs is *derived*, never stored: a contract
 * inherits the source of its case (`isCompany` / `sourceLawyer`). Re-classifying
 * a case therefore re-classifies its money immediately, with nothing to sync.
 * A contract with no case counts as company money.
 */
function scopeFilter(query: FinancialsQuery): Prisma.LawyerFeesContractWhereInput {
    if (query.scope === "LAWYER") {
        return query.sourceLawyerId
            ? { case: { isCompany: false, sourceLawyerId: query.sourceLawyerId } }
            : { case: { isCompany: false } };
    }
    return { OR: [{ caseId: null }, { case: { isCompany: true } }] };
}

/** Inclusive-start, exclusive-end range for a year, or one month within it. */
function periodRange(year?: number, month?: number): { gte: Date; lt: Date } | null {
    if (!year) return null;
    if (month) {
        return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
    }
    return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

const contractSelect = {
    id: true,
    contractNumber: true,
    contractDate: true,
    clientName: true,
    totalFees: true,
    currency: true,
    customer: { select: { id: true, fullName: true } },
    case: {
        select: {
            id: true,
            caseType: true,
            isCompany: true,
            completedAt: true,
            sourceLawyer: { select: { id: true, name: true } },
        },
    },
    payments: { where: { isDeleted: false }, select: { amount: true, paidAt: true } },
} satisfies Prisma.LawyerFeesContractSelect;

type ContractRow = Prisma.LawyerFeesContractGetPayload<{ select: typeof contractSelect }>;

export interface FinancialsRow {
    id: string;
    contractNumber: string | null;
    contractDate: Date | null;
    clientName: string;
    caseId: string | null;
    caseType: string | null;
    currency: string;
    sourceLawyerId: string | null;
    sourceLawyerName: string | null;
    totalFees: number;
    paidTotal: number;
    /** Collected within the selected period — 0 when no period is selected. */
    paidInPeriod: number;
    remaining: number;
}

export class FinancialsService {
    /**
     * Rows are one-per-contract: the contract is what carries money, so cases
     * without one simply do not appear here.
     */
    private async loadContracts(query: FinancialsQuery): Promise<ContractRow[]> {
        const period = periodRange(query.year, query.month);
        const and: Prisma.LawyerFeesContractWhereInput[] = [
            { isDeleted: false },
            scopeFilter(query),
        ];
        // A contract's date is optional — fees can be agreed (and money owed)
        // before anyone fills the contract date in. Filtering a period on
        // `contractDate` alone would silently drop those undated contracts,
        // hiding real balances the moment a year is picked. Keep them in.
        if (period) and.push({ OR: [{ contractDate: period }, { contractDate: null }] });
        if (query.search) {
            const contains = { contains: query.search, mode: "insensitive" as const };
            and.push({
                OR: [
                    { contractNumber: contains },
                    { clientName: contains },
                    { customer: { fullName: contains } },
                ],
            });
        }

        return prisma.lawyerFeesContract.findMany({
            where: { AND: and },
            select: contractSelect,
            orderBy: { createdAt: "desc" },
        });
    }

    private toRow(c: ContractRow, query: FinancialsQuery): FinancialsRow {
        const period = periodRange(query.year, query.month);
        const totalFees = toAmount(c.totalFees);
        const paidTotal = sumAmounts(c.payments.map((p) => p.amount));
        const paidInPeriod = period
            ? sumAmounts(
                  c.payments
                      .filter((p) => p.paidAt >= period.gte && p.paidAt < period.lt)
                      .map((p) => p.amount),
              )
            : paidTotal;

        return {
            id: c.id,
            contractNumber: c.contractNumber,
            contractDate: c.contractDate,
            clientName: c.clientName || c.customer?.fullName || "",
            caseId: c.case?.id ?? null,
            caseType: c.case?.caseType ?? null,
            currency: c.currency ?? "SAR",
            sourceLawyerId: c.case?.sourceLawyer?.id ?? null,
            sourceLawyerName: c.case?.sourceLawyer?.name ?? null,
            totalFees,
            paidTotal,
            paidInPeriod,
            remaining: round2(totalFees - paidTotal),
        };
    }

    /**
     * Headline totals for the selected scope + period.
     *
     * `contractsTotal` counts contracts *signed* in the period; `paidInPeriod`
     * counts money *collected* in it. The two deliberately describe different
     * sets, so they are labelled separately in the UI rather than presented as
     * parts of one sum. `remainingTotal` is lifetime debt on those contracts —
     * "still owed" is not a monthly quantity.
     */
    async summary(query: FinancialsQuery) {
        const contracts = await this.loadContracts(query);
        const rows = contracts.map((c) => this.toRow(c, query));

        const byLawyer = new Map<
            string,
            { lawyerId: string; name: string; contractsTotal: number; paidTotal: number; remainingTotal: number; contractsCount: number }
        >();
        for (const r of rows) {
            if (!r.sourceLawyerId) continue;
            const entry = byLawyer.get(r.sourceLawyerId) ?? {
                lawyerId: r.sourceLawyerId,
                name: r.sourceLawyerName ?? "",
                contractsTotal: 0,
                paidTotal: 0,
                remainingTotal: 0,
                contractsCount: 0,
            };
            entry.contractsTotal = round2(entry.contractsTotal + r.totalFees);
            entry.paidTotal = round2(entry.paidTotal + r.paidTotal);
            entry.remainingTotal = round2(entry.remainingTotal + r.remaining);
            entry.contractsCount += 1;
            byLawyer.set(r.sourceLawyerId, entry);
        }

        return {
            scope: query.scope,
            year: query.year ?? null,
            month: query.month ?? null,
            contractsCount: rows.length,
            contractsTotal: round2(rows.reduce((a, r) => a + r.totalFees, 0)),
            paidTotal: round2(rows.reduce((a, r) => a + r.paidTotal, 0)),
            paidInPeriod: round2(rows.reduce((a, r) => a + r.paidInPeriod, 0)),
            remainingTotal: round2(rows.reduce((a, r) => a + r.remaining, 0)),
            byLawyer: [...byLawyer.values()].sort((a, b) => b.remainingTotal - a.remainingTotal),
        };
    }

    /** The same filtered set as {@link summary}, paginated for the table. */
    async contracts(
        query: FinancialsQuery,
        rawQuery: Record<string, unknown>,
    ): Promise<{ data: FinancialsRow[]; meta: PageMeta }> {
        const q = parseListQuery(rawQuery, { defaultLimit: 20 });
        // Newest first — the DB already ordered by `createdAt` desc, so the
        // rows keep that order rather than being re-sorted by amount owed.
        const rows = (await this.loadContracts(query)).map((c) => this.toRow(c, query));

        return {
            data: rows.slice(q.skip, q.skip + q.take),
            meta: buildMeta(rows.length, q.page, q.limit),
        };
    }

    /**
     * Years that actually have contracts, newest first — drives the year picker.
     * A self-scoped viewer only gets the years their own contracts fall in;
     * offering them a year with nothing behind it would just show an empty page.
     */
    async availableYears(query: FinancialsQuery): Promise<number[]> {
        const rows = await prisma.lawyerFeesContract.findMany({
            where: {
                isDeleted: false,
                contractDate: { not: null },
                ...(query.restrictedToSelf ? scopeFilter(query) : {}),
            },
            select: { contractDate: true },
        });
        const years = new Set<number>();
        for (const r of rows) {
            if (r.contractDate) years.add(r.contractDate.getUTCFullYear());
        }
        return [...years].sort((a, b) => b - a);
    }
}
