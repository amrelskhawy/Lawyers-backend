/**
 * The fixed practice-area categories every service is optionally filed
 * under. Fixed by business decision — there is no admin UI to add, rename or
 * delete one, only to assign/reassign a service to one of these.
 *
 * Kept here rather than as database rows so the Prisma `ServiceCategory` enum
 * (validity) and this array (display copy, icon, color, order) are each a
 * single source of truth, with no admin CRUD surface to keep in sync.
 */

export const SERVICE_CATEGORY_IDS = [
    "COMMERCIAL_AFFAIRS",
    "CRIMINAL_CYBERCRIME",
    "LABOR_DISPUTES",
    "FAMILY_PERSONAL_STATUS",
    "REAL_ESTATE",
    "BANKING_INSURANCE",
    "MEDICAL_MALPRACTICE",
    "ZAKAT_TAX",
    "EXECUTION_CASES",
] as const;

export type ServiceCategoryId = (typeof SERVICE_CATEGORY_IDS)[number];

export interface ServiceCategoryMeta {
    id: ServiceCategoryId;
    /** URL key for /services/category/:slug — stable, never renamed. */
    slug: string;
    /** Display order on the homepage grid and the admin select. */
    order: number;
    name_ar: string;
    name_en: string;
    /** Short teaser for the homepage card. */
    description_ar: string;
    description_en: string;
    /** Longer opening paragraph for the category's own page. */
    intro_ar: string;
    intro_en: string;
    /** Font Awesome class, e.g. "fa-briefcase". */
    icon: string;
    /** Hex accent used for the card band, icon badge and page hero. */
    color: string;
}

export const SERVICE_CATEGORIES: ServiceCategoryMeta[] = [
    {
        id: "COMMERCIAL_AFFAIRS",
        slug: "commercial-affairs",
        order: 1,
        name_ar: "القضايا والخدمات التجارية",
        name_en: "Commercial Affairs & Services",
        description_ar: "صياغة العقود التجارية وتأسيس الشركات وحل المنازعات التجارية بخبرة قانونية متخصصة.",
        description_en: "Contract drafting, company formation, and commercial dispute resolution.",
        intro_ar:
            "نقدم مجموعة متكاملة من الخدمات القانونية التجارية تشمل تأسيس الشركات وصياغة ومراجعة العقود التجارية والتفاوض وحل المنازعات التجارية أمام المحاكم التجارية وهيئات التحكيم، بما يحفظ حقوق عملائنا ويضمن استمرارية أعمالهم.",
        intro_en:
            "A full range of commercial legal services: company formation, drafting and reviewing commercial contracts, negotiation, and resolving commercial disputes before commercial courts and arbitration bodies.",
        icon: "fa-briefcase",
        color: "#c6a15b",
    },
    {
        id: "CRIMINAL_CYBERCRIME",
        slug: "criminal-cybercrime",
        order: 2,
        name_ar: "القضايا الجنائية والجرائم المعلوماتية",
        name_en: "Criminal Cases & Cybercrime",
        description_ar: "دفاع جنائي متمرس ومتابعة قضايا الجرائم المعلوماتية أمام النيابة العامة والمحاكم الجزائية.",
        description_en: "Criminal defense and cybercrime case handling before public prosecution and courts.",
        intro_ar:
            "نتولى الدفاع في القضايا الجنائية بمختلف أنواعها ومتابعة قضايا الجرائم المعلوماتية والاحتيال الإلكتروني أمام النيابة العامة والمحاكم الجزائية، مع الحرص على حماية حقوق موكلينا في كل مراحل التقاضي.",
        intro_en:
            "We handle criminal defense across all case types and pursue cybercrime and online fraud cases before public prosecution and criminal courts, protecting our clients' rights at every stage.",
        icon: "fa-shield-halved",
        color: "#8e2f3c",
    },
    {
        id: "LABOR_DISPUTES",
        slug: "labor-disputes",
        order: 3,
        name_ar: "منازعات العمل والعمال",
        name_en: "Labor & Employment Disputes",
        description_ar: "تمثيل أصحاب العمل والعمال في منازعات العمل أمام المحاكم العمالية وتسوية المستحقات.",
        description_en: "Representing employers and employees in labor disputes and settlements.",
        intro_ar:
            "نقدم الاستشارات والتمثيل القانوني في منازعات العمل والعمال، بما في ذلك فصل العمال وتسوية المستحقات العمالية وعقود العمل ولوائح الموارد البشرية، أمام المحاكم العمالية المختصة.",
        intro_en:
            "Legal advice and representation in labor and employment disputes — termination, settlement of dues, employment contracts, and HR policy — before the competent labor courts.",
        icon: "fa-people-carry-box",
        color: "#35618f",
    },
    {
        id: "FAMILY_PERSONAL_STATUS",
        slug: "family-personal-status",
        order: 4,
        name_ar: "قضايا الأسرة والأحوال الشخصية",
        name_en: "Family & Personal Status",
        description_ar: "استشارات ومرافعات في قضايا الطلاق والحضانة والميراث والأحوال الشخصية.",
        description_en: "Advice and litigation in divorce, custody, inheritance, and personal status matters.",
        intro_ar:
            "نتعامل بخصوصية وحرفية مع قضايا الأحوال الشخصية كالزواج والطلاق والحضانة والنفقة وتقسيم التركات، ونحرص على تقديم حلول قانونية متوازنة تراعي الجانب الإنساني لكل قضية.",
        intro_en:
            "We handle personal status matters — marriage, divorce, custody, alimony, and estate division — with discretion, offering balanced legal solutions that respect the human side of every case.",
        icon: "fa-people-roof",
        color: "#2f6f5e",
    },
    {
        id: "REAL_ESTATE",
        slug: "real-estate",
        order: 5,
        name_ar: "المنازعات والخدمات العقارية",
        name_en: "Real Estate Disputes & Services",
        description_ar: "صياغة عقود البيع والإيجار وحل المنازعات العقارية وتوثيق الملكية.",
        description_en: "Sale and lease contracts, and resolving real estate disputes.",
        intro_ar:
            "نقدم خدمات قانونية عقارية شاملة تغطي صياغة ومراجعة عقود البيع والإيجار والتطوير العقاري، وحل المنازعات العقارية المتعلقة بالملكية والتسليم والعيوب الخفية أمام الجهات المختصة.",
        intro_en:
            "Comprehensive real estate legal services covering sale, lease and development contracts, and resolving ownership, handover, and hidden-defect disputes before the competent authorities.",
        icon: "fa-building",
        color: "#a15c2f",
    },
    {
        id: "BANKING_INSURANCE",
        slug: "banking-insurance",
        order: 6,
        name_ar: "المنازعات المصرفية والتأمين",
        name_en: "Banking & Insurance Disputes",
        description_ar: "تمثيل قانوني في المنازعات المصرفية ومطالبات التأمين أمام الجهات المختصة.",
        description_en: "Legal representation in banking disputes and insurance claims.",
        intro_ar:
            "نمثل عملاءنا في المنازعات المصرفية كالتسهيلات الائتمانية والرهن العقاري، وفي مطالبات التأمين المرفوضة أو المتأخرة، أمام لجان المنازعات المصرفية وهيئات فض المنازعات التأمينية.",
        intro_en:
            "We represent clients in banking disputes such as credit facilities and mortgages, and in rejected or delayed insurance claims, before banking dispute committees and insurance settlement bodies.",
        icon: "fa-building-columns",
        color: "#3a3f8b",
    },
    {
        id: "MEDICAL_MALPRACTICE",
        slug: "medical-malpractice",
        order: 7,
        name_ar: "الأخطاء والمسؤولية الطبية",
        name_en: "Medical Errors & Liability",
        description_ar: "متابعة قضايا الأخطاء الطبية وتحديد المسؤولية والمطالبة بالتعويض العادل.",
        description_en: "Pursuing medical malpractice claims and fair compensation.",
        intro_ar:
            "نساند المرضى وذويهم في قضايا الأخطاء الطبية من خلال إثبات المسؤولية الطبية أمام الهيئة السعودية للتخصصات الصحية واللجان الطبية، والمطالبة بالتعويضات المستحقة عن الأضرار الناتجة.",
        intro_en:
            "We support patients and their families in medical malpractice cases, establishing liability before the Saudi Commission for Health Specialties and medical committees, and pursuing fair compensation.",
        icon: "fa-briefcase-medical",
        color: "#1f7a72",
    },
    {
        id: "ZAKAT_TAX",
        slug: "zakat-tax",
        order: 8,
        name_ar: "القضايا والاعتراضات الزكاوية والضريبية",
        name_en: "Zakat & Tax Cases and Objections",
        description_ar: "إعداد الاعتراضات الزكوية والضريبية ومتابعتها أمام لجان الاعتراض الضريبي.",
        description_en: "Preparing and pursuing zakat and tax objections before dispute committees.",
        intro_ar:
            "نقدم الاستشارات وإعداد الاعتراضات على الربوط الزكوية والضريبية، ونمثل عملاءنا أمام لجان فض المنازعات الضريبية والزكوية لضمان أفضل النتائج الممكنة.",
        intro_en:
            "We provide advice and prepare objections to zakat and tax assessments, representing clients before zakat and tax dispute resolution committees to secure the best possible outcome.",
        icon: "fa-file-invoice-dollar",
        color: "#6b3f7a",
    },
    {
        id: "EXECUTION_CASES",
        slug: "execution-cases",
        order: 9,
        name_ar: "قضايا التنفيذ",
        name_en: "Execution Cases",
        description_ar: "متابعة طلبات التنفيذ واستيفاء الحقوق أمام محاكم التنفيذ بكفاءة وسرعة.",
        description_en: "Pursuing execution requests and enforcing judgments before execution courts.",
        intro_ar:
            "نتولى إعداد ومتابعة طلبات التنفيذ أمام محاكم التنفيذ لاستيفاء الحقوق الثابتة بموجب الأحكام القضائية والسندات التنفيذية، بما يشمل الحجز على أموال المدين ومنعه من السفر واتخاذ الإجراءات النظامية اللازمة لاستيفاء الحقوق.",
        intro_en:
            "We prepare and pursue execution requests before execution courts to enforce rights established by judgments and executive instruments, including attaching debtor assets, travel bans, and the legal measures needed to secure our clients' rights.",
        icon: "fa-gavel",
        color: "#4a4a4a",
    },
];

export const SERVICE_CATEGORY_BY_ID = new Map(SERVICE_CATEGORIES.map((c) => [c.id, c]));
export const SERVICE_CATEGORY_BY_SLUG = new Map(SERVICE_CATEGORIES.map((c) => [c.slug, c]));
