import { Prisma } from "@prisma/client";
import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { round2, sumAmounts, toAmount } from "../../core/utils/money.js";
import type {
    CreateContractPaymentPayload,
    UpdateContractPaymentPayload,
} from "./lawyer-fees-contracts.validator.js";

const paymentInclude = {
    recordedBy: { select: { id: true, name: true } },
} satisfies Prisma.ContractPaymentInclude;

type PaymentRow = Prisma.ContractPaymentGetPayload<{ include: typeof paymentInclude }>;

/** API shape — money as plain numbers, never Prisma Decimals. */
function serialize(p: PaymentRow) {
    return { ...p, amount: toAmount(p.amount) };
}

export interface ContractPaymentsSummary {
    contractId: string;
    /** The contract's agreed fees. 0 when the contract has no total set yet. */
    totalFees: number;
    paidTotal: number;
    remaining: number;
    payments: ReturnType<typeof serialize>[];
}

export class ContractPaymentsService {
    /** Load the contract that owns the payments, or 404. */
    private async requireContract(contractId: string) {
        const contract = await prisma.lawyerFeesContract.findUnique({
            where: { id: contractId },
            select: { id: true, totalFees: true, isDeleted: true, currency: true },
        });
        if (!contract || contract.isDeleted) {
            throw new AppResponse(false, "LAWYER_FEES_CONTRACT_NOT_FOUND", null, 404);
        }
        return contract;
    }

    /** All live payments on a contract plus the totals derived from them. */
    async listForContract(contractId: string): Promise<ContractPaymentsSummary> {
        const contract = await this.requireContract(contractId);
        const payments = await prisma.contractPayment.findMany({
            where: { contractId, isDeleted: false },
            include: paymentInclude,
            orderBy: { paidAt: "desc" },
        });

        const totalFees = toAmount(contract.totalFees);
        const paidTotal = sumAmounts(payments.map((p) => p.amount));

        return {
            contractId,
            totalFees,
            paidTotal,
            remaining: round2(totalFees - paidTotal),
            payments: payments.map(serialize),
        };
    }

    /**
     * A contract can only take payments once its fees are agreed, and the
     * collected total may never exceed them — there is nothing left to subtract
     * from. `excludePaymentId` lets an edit ignore its own current amount.
     */
    private async assertWithinTotal(
        contractId: string,
        totalFees: number,
        amount: number,
        excludePaymentId?: string,
    ) {
        if (totalFees <= 0) {
            throw new AppResponse(false, "CONTRACT_TOTAL_FEES_NOT_SET", null, 400);
        }
        const others = await prisma.contractPayment.findMany({
            where: {
                contractId,
                isDeleted: false,
                ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
            },
            select: { amount: true },
        });
        const projected = round2(sumAmounts(others.map((o) => o.amount)) + amount);
        if (projected > totalFees) {
            throw new AppResponse(
                false,
                "PAYMENT_EXCEEDS_CONTRACT_TOTAL",
                { totalFees, alreadyPaid: sumAmounts(others.map((o) => o.amount)) },
                400,
            );
        }
    }

    async create(contractId: string, payload: CreateContractPaymentPayload, recordedById: string) {
        const contract = await this.requireContract(contractId);
        const amount = toAmount(payload.amount);
        await this.assertWithinTotal(contractId, toAmount(contract.totalFees), amount);

        await prisma.contractPayment.create({
            data: {
                contractId,
                amount: new Prisma.Decimal(amount),
                paidAt: new Date(payload.paidAt),
                note: payload.note ?? null,
                recordedById,
            },
        });

        return this.listForContract(contractId);
    }

    async update(contractId: string, paymentId: string, payload: UpdateContractPaymentPayload) {
        const contract = await this.requireContract(contractId);
        const existing = await prisma.contractPayment.findUnique({ where: { id: paymentId } });
        if (!existing || existing.isDeleted || existing.contractId !== contractId) {
            throw new AppResponse(false, "CONTRACT_PAYMENT_NOT_FOUND", null, 404);
        }

        const data: Prisma.ContractPaymentUpdateInput = {};
        if (payload.amount !== undefined) {
            const amount = toAmount(payload.amount);
            await this.assertWithinTotal(
                contractId,
                toAmount(contract.totalFees),
                amount,
                paymentId,
            );
            data.amount = new Prisma.Decimal(amount);
        }
        if (payload.paidAt !== undefined) data.paidAt = new Date(payload.paidAt);
        if (payload.note !== undefined) data.note = payload.note;

        await prisma.contractPayment.update({ where: { id: paymentId }, data });
        return this.listForContract(contractId);
    }

    async remove(contractId: string, paymentId: string) {
        await this.requireContract(contractId);
        const existing = await prisma.contractPayment.findUnique({ where: { id: paymentId } });
        if (!existing || existing.isDeleted || existing.contractId !== contractId) {
            throw new AppResponse(false, "CONTRACT_PAYMENT_NOT_FOUND", null, 404);
        }
        await prisma.contractPayment.update({
            where: { id: paymentId },
            data: { isDeleted: true },
        });
        return this.listForContract(contractId);
    }

    /**
     * Payment summaries for every live contract on a case, newest first. Backs
     * the payments icon in the cases list: one contract opens straight into the
     * dialog, several show a picker, none is a no-op.
     */
    async listForCase(caseId: string) {
        const contracts = await prisma.lawyerFeesContract.findMany({
            where: { caseId, isDeleted: false },
            select: {
                id: true,
                contractNumber: true,
                clientName: true,
                totalFees: true,
                currency: true,
                contractDate: true,
                payments: { where: { isDeleted: false }, select: { amount: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return contracts.map((c) => {
            const totalFees = toAmount(c.totalFees);
            const paidTotal = sumAmounts(c.payments.map((p) => p.amount));
            return {
                id: c.id,
                contractNumber: c.contractNumber,
                clientName: c.clientName,
                contractDate: c.contractDate,
                currency: c.currency,
                totalFees,
                paidTotal,
                remaining: round2(totalFees - paidTotal),
            };
        });
    }
}
