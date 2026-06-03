import type { ReminderType } from "@prisma/client";

/**
 * Each reminder type carries two message templates: one phrased for the lawyer,
 * one for the customer. Resolved at send time — never persisted per reminder.
 * `{content}` is replaced by the reminder's own `content` field (used by CUSTOM).
 */
export const REMINDER_MESSAGES: Record<
    ReminderType,
    { lawyer: string; customer: string }
> = {
    SESSION_DETAILS_REVIEW: {
        lawyer: "تذكير: اقتراب موعد الجلسة القادمة. يُرجى مراجعة تفاصيل القضية والاستعداد.",
        customer: "عميلنا العزيز، نذكّركم باقتراب موعد جلستكم القادمة. فريقنا القانوني يراجع التفاصيل.",
    },
    MEMO_REVIEW_UPLOAD: {
        lawyer: "تذكير: يُرجى مراجعة المذكرات ورفعها بعد اعتمادها من العميل قبل الجلسة.",
        customer: "عميلنا العزيز، نعمل على إعداد المذكرات الخاصة بقضيتكم ونحتاج اعتمادكم عليها.",
    },
    URGENT_SESSION_SOON: {
        lawyer: "تذكير عاجل: موعد الجلسة بات قريبًا جدًا. يُرجى التأكد من جاهزية كل المستندات.",
        customer: "عميلنا العزيز، تذكير عاجل باقتراب موعد جلستكم. نتمنى لكم التوفيق.",
    },
    CUSTOM: {
        lawyer: "{content}",
        customer: "{content}",
    },
};

/** Short Arabic description of each type's "level" — shown in the UI dropdown. */
export const REMINDER_TYPE_DESCRIPTIONS: Record<ReminderType, string> = {
    SESSION_DETAILS_REVIEW: "تذكير بموعد الجلسة القادمة ومراجعة التفاصيل",
    MEMO_REVIEW_UPLOAD: "تذكير بمراجعة ورفع المذكرات بعد اعتمادها من العميل",
    URGENT_SESSION_SOON: "تذكير عاجل بقرب موعد الجلسة",
    CUSTOM: "تذكير مخصص",
};

/**
 * Build the lawyer/customer message bodies for a reminder, interpolating
 * `{content}`. Falls back to the type description when CUSTOM has no content.
 */
export function buildMessages(
    type: ReminderType,
    content?: string | null,
): { lawyer: string; customer: string } {
    const tpl = REMINDER_MESSAGES[type];
    const body = (content ?? "").trim() || REMINDER_TYPE_DESCRIPTIONS[type];
    return {
        lawyer: tpl.lawyer.replace("{content}", body),
        customer: tpl.customer.replace("{content}", body),
    };
}
