import type { ReminderType } from "@prisma/client";

/**
 * Real data interpolated into reminder templates at send time. Missing values
 * fall back to a neutral dash so a message never renders a raw `{placeholder}`.
 */
export interface ReminderContext {
    clientName?: string | null;
    caseNumber?: string | null;
    court?: string | null;
    sessionDate?: string | null; // Hijri date string, e.g. "1447-12-15"
    sessionTime?: string | null; // HH:mm
    requirements?: string | null;
    /** Body for CUSTOM reminders (the reminder's own `content`). */
    content?: string | null;
}

const PLACEHOLDER = "—";

/**
 * Each reminder type carries two message templates: one phrased for the lawyer,
 * one for the customer. Resolved at send time — never persisted per reminder.
 * Templates use named placeholders ({clientName}, {caseNumber}, {court},
 * {sessionDate}, {sessionTime}, {requirements}) filled from the case data.
 */
export const REMINDER_MESSAGES: Record<
    ReminderType,
    { lawyer: string; customer: string }
> = {
    // Reminder 1 — 15 days before: session scheduled / review the file.
    SESSION_DETAILS_REVIEW: {
        lawyer: `تنبيه بموعد جلسة قضائية

نفيدكم بوجود جلسة قضائية مجدولة على القضية التالية:

▪️ إسم العميل: {clientName}
▪️ رقم القضية: {caseNumber}
▪️ المحكمة: {court}
▪️ موعد الجلسة: {sessionDate} - {sessionTime}
▪️ المطلوب للجلسة: {requirements}

نأمل التكرم بمراجعة ملف القضية والتأكد من جاهزية:

• المذكرات
• المرفقات
• الطلبات
• المستندات الداعمة

مع ضرورة تحديث حالة القضية بالنظام الداخلي بعد انتهاء الجلسة مباشرة.

مع خالص التقدير.`,
        customer: `عزيزنا العميل: {clientName}
السلام عليكم ورحمة الله وبركاته،،
حرصاً منا على تقديم أفضل تمثيل قانوني نود تذكيركم بموعد الجلسة المجدولة لقضيتكم،
▪️ رقم {caseNumber}
▪️ بمحكمة {court}
▪️ والتي ستكون بتاريخ {sessionDate} الساعة {sessionTime}
وفي حال رغبتكم في تقديم أي إضافات، أو مستندات جديدة، أو ملحوظات تخص القضية؛ نأمل منكم التكرم بالتواصل مباشرة مع المحامي المختص بالقضية في أقرب وقت ممكن.
شاكرين لكم حسن تعاونكم وثقتكم بنا.
مع خالص التقدير،
شركة سعد البقمي للمحاماة والاستشارات القانونية - رفيقك القانوني-`,
    },

    // Reminder 2 — 7 days before: memo review/upload.
    MEMO_REVIEW_UPLOAD: {
        lawyer: `تذكير عاجل 🚨

نحيطكم علمًا بأن موعد الجلسة القضائية الخاصة بالقضية رقم {caseNumber}

▪️ إسم العميل: {clientName}
▪️ رقم القضية: {caseNumber}
▪️ المحكمة: {court}
▪️ موعد الجلسة: {sessionDate} - {sessionTime}

سيكون بعد سبعة أيام من تاريخ هذا التنبيه.

نأمل التأكد من:

• جاهزية المذكرة النهائية (إن وجد)
• إرسال المذكرة للعميل ومتابعة التعديلات والاعتماد المباشر
• رفع المذكرة في النظام
• التحضير والاستعداد للجلسة
• الاطلاع على رد الخصم

نسأل الله لكم التوفيق.`,
        customer: `عزيزنا العميل: {clientName}
السلام عليكم ورحمة الله وبركاته،،
حرصاً منا على تقديم أفضل تمثيل قانوني، نود تذكيركم بقرب موعد الجلسة المجدولة لقضيتكم
▪️ رقم {caseNumber}
▪️ بمحكمة {court}
▪️ والتي ستكون بتاريخ {sessionDate}
▪️ الساعة {sessionTime}
والتي ستكون بعد (7) أيام من تاريخه.
ونظراً لأهمية هذه المرحلة في إعداد الدفوع والمذكرات، نأمل منكم مراجعة مسودة المذكرة (إن وجدت) واعتمادها، أو تزويدنا بأي ملحوظات نهائية ليتسنى لنا رفعها عبر النظام القضائي في الوقت المحدد.
شاكرين لكم حسن تعاونكم وحرصكم.
مع خالص التقدير،
شركة سعد البقمي للمحاماة والاستشارات القانونية - رفيقك القانوني-`,
    },

    // Reminder 3 — 1 hour before: session starts soon.
    URGENT_SESSION_SOON: {
        lawyer: `تذكير عاجل 🚨

نحيطكم علمًا بأن موعد الجلسة القضائية الخاصة بالقضية رقم {caseNumber}
للعميل {clientName}.
سيكون بعد ساعة من الآن.

نأمل التأكد من:

• التحضير والجاهزية للجلسة
• تحديث النظام الداخلي بعد انتهاء الجلسة

نتمنى لكم التوفيق.`,
        customer: `عزيزنا العميل: {clientName}
السلام عليكم ورحمة الله وبركاته،،
حرصاً منا على إبقائكم على اطلاع دائم بمجريات النزاع القضائي، نود تذكيركم بأن الجلسة المجدولة لقضيتكم:
▪️ رقم {caseNumber}
▪️ بمحكمة {court}
ستبدأ بعد ساعة من الآن بمشيئة الله.
نسأل الله لنا ولكم التوفيق والسداد، ونحيطكم علماً بأن المحامي المختص سيتولى مباشرة الجلسة وتقديم الدفوع اللازمة، وسنقوم بتحديثكم بالنتائج وما يتم في الجلسة فور انتهائها مباشرة.
شاكرين لكم ثقتكم الدائمة بنا.
مع خالص التقدير،
شركة سعد البقمي للمحاماة والاستشارات القانونية - رفيقك القانوني-`,
    },

    CUSTOM: {
        lawyer: "{content}",
        customer: "{content}",
    },
};

/** Short Arabic description of each type's "level" — shown in the UI dropdown. */
export const REMINDER_TYPE_DESCRIPTIONS: Record<ReminderType, string> = {
    SESSION_DETAILS_REVIEW: "تنبيه بموعد الجلسة القادمة (قبل 15 يومًا)",
    MEMO_REVIEW_UPLOAD: "تذكير بمراجعة ورفع المذكرات (قبل 7 أيام)",
    URGENT_SESSION_SOON: "تذكير عاجل بقرب موعد الجلسة (قبل ساعة)",
    CUSTOM: "تذكير مخصص",
};

/** Replace every named placeholder in `template` from `values`, blanks → dash. */
function interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
        const v = values[key];
        return v && v.trim().length ? v.trim() : PLACEHOLDER;
    });
}

/**
 * Build the lawyer/customer message bodies for a reminder, interpolating the
 * case data. CUSTOM falls back to the type description when it has no content.
 */
export function buildMessages(
    type: ReminderType,
    ctx: ReminderContext = {},
): { lawyer: string; customer: string } {
    const tpl = REMINDER_MESSAGES[type];

    if (type === "CUSTOM") {
        const body = (ctx.content ?? "").trim() || REMINDER_TYPE_DESCRIPTIONS.CUSTOM;
        return { lawyer: body, customer: body };
    }

    const values: Record<string, string> = {
        clientName: ctx.clientName ?? "",
        caseNumber: ctx.caseNumber ?? "",
        court: ctx.court ?? "",
        sessionDate: ctx.sessionDate ?? "",
        sessionTime: ctx.sessionTime ?? "",
        requirements: ctx.requirements ?? "",
    };

    return {
        lawyer: interpolate(tpl.lawyer, values),
        customer: interpolate(tpl.customer, values),
    };
}
