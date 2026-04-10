/**
 * Static, branding-level data shared by every generated case report.
 * These come from the original `client-form-data.json` / `lawyer-form-data.json`
 * fixtures and are firm-wide — not per-case data.
 */
export const REPORT_BRANDING = {
    company_name: "شركة سعد البقمي",
    company_subtitle: "للمحاماة والاستشارات القانونية",
    welcome_text: "حياكم",
};

/**
 * The static "documents the client must bring" list rendered in the client form.
 */
export const REPORT_REQUIREMENTS: string[] = [
    "صورة الهوية",
    "رقم جوال أبشر",
    "العنوان الوطني",
    "صورة من المستندات",
    "تحميل تطبيق توكلنا",
];

/**
 * Arabic labels for each CaseType enum value, in the order shown on the form.
 * Order is meaningful — the report renders them as a checkbox grid in this order.
 */
export const CASE_TYPE_LABELS: { value: string; label: string }[] = [
    { value: "CRIMINAL", label: "جنائية" },
    { value: "ADMINISTRATIVE", label: "إدارية" },
    { value: "LABOR", label: "عمالية" },
    { value: "COMMERCIAL", label: "تجارية" },
    { value: "PENAL", label: "جزائية" },
    { value: "GENERAL", label: "عامة" },
    { value: "PERSONAL_STATUS", label: "أحوال شخصية" },
];
