/**
 * WhatsApp templates owned by the cases module. Mirrors the reminders module's
 * `reminders.messages.ts` — templates live next to the domain that sends them
 * and are resolved at send time, never persisted.
 */

/** Money as it appears inside a message body: grouped, no trailing ".00". */
function formatAmount(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
}

/**
 * Sent to the client when their case is marked fully completed while a balance
 * is still owed on the case's fees contracts. Automated — the closing note tells
 * the client to ignore it if they have already paid.
 *
 * `clientName` is the name on the contract that carries the balance, falling
 * back to the customer record. It is optional because older contracts and
 * customer rows can both be nameless; the greeting stays generic then.
 */
export function buildOutstandingBalanceMessage(
    remaining: number,
    clientName?: string | null,
): string {
    const greeting = clientName?.trim() ? `عزيزي العميل / ${clientName.trim()}` : "عزيزي العميل:";
    return `${greeting}

تهديكم شركة سعد البقمي للمحاماة والاستشارات القانونية أطيب التحايا

ونفيدكم بأنه قد تم الانتهاء من جميع الأعمال والإجراءات المتعلقة بالمعاملة الخاصة بكم وفقًا للعقد المبرم بيننا، ونشكر لكم ثقتكم الغالية التي نعتز بها.

ونود تذكيركم باستحقاق الدفعة الأخيرة من العقد ومقدارها ${formatAmount(remaining)} ريال سعودي، ونأمل التكرم بإتمام سدادها في أقرب وقت، وذلك لاستكمال إغلاق الملف وإنهاء جميع الإجراءات المالية الخاصة بالعقد.

ولأي استفسار أو رغبة في تزويدكم ببيان المبلغ أو وسائل السداد، يسعدنا خدمتكم في أي وقت.

ملاحظة: هذه رسالة آلية وتم إرسالها بشكل آلي من نظام التشغيل الداخلي، وفي حال تم سداد المبلغ المستحق مؤخرًا أو كانت هناك أي إتفاقات أُخرى ،يرجى تجاهل هذه الرسالة .. مع خالص شكرنا وتقديرنا.`;
}
