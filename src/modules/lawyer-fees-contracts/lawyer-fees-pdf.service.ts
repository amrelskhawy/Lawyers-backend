import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type { LawyerFeesContract } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(__dirname, "../../views/lawyer-fees/lawyer-fees-contract.hbs");
const BG_DIR        = path.resolve(__dirname, "../../views/lawyer-fees");
const BG_URL_1      = `file://${path.join(BG_DIR, "lawyer-fees-contract-01.png")}`;
const BG_URL_2      = `file://${path.join(BG_DIR, "lawyer-fees-contract-02.png")}`;
const BG_URL_3      = `file://${path.join(BG_DIR, "lawyer-fees-contract-03.png")}`;

const PAGE2_DEFAULT = `2 . جميع الأتعاب المدفوعة تعتبر مقابل الأعمال المنجزة وغير قابلة للاسترداد.
3 . يتحمل الطرف الثاني الرسوم القضائية، والمصاريف الحكومية، ورسوم الغرف التجارية، وأي مصاريف إدارية لازمة لسير الإجراءات.
4 . في حال كانت القضية خارج المنطقة الغربية، يتحمل الطرف الثاني تكاليف الإقامة والمعيشة والانتقالات الخاصة بالمحامي أو فريق العمل الميداني، على أن يتم إخطار الطرف الثاني بالمبالغ التقديرية قبل الانتقال وذلك وفق اتفاق منفصل.
5 . يتحمل الطرف الثاني رسوم الترجمة المعتمدة لأي مستندات أو مراسلات تستلزم ذلك.
6 . في حال إحالة القضية إلى الخبراء من قبل الجهة القضائية أو بناءً على مقتضى الإجراءات النظامية، يلتزم الطرف الثاني، بدفع كامل تكاليف ومصاريف الخبراء المعتمدين فور طلبها، ويشمل ذلك أتعاب الخبرة، وتكاليف الانتقال إن وجدت، وأي رسوم إدارية ذات صلة، دون أن يتحمل الطرف الأول أي مسؤولية مالية عنها.
البند الثالث - التزامات الطرف الأول -:
.1 تقديم الخدمات القانونية المتفق عليها بكفاءة واحترافية.
.2 اطلاع الطرف الثاني على أهم المستجدات القانونية.
.3 الحفاظ على سرية جميع المعلومات.
.4 العمل لمصلحة الطرف الثاني في كافة أنواع الدعاوى المتفق عليها، وكذلك مراجعة الجهات الحكومية والشرطية والنيابة العامة والجهات التي تستلزم الأعمال مراجعتها كافة.
.5 بذل عناية الرجل الحريص لتحقيق مصلحة الطرف الثاني، كذلك مطالب ببذل عناية وليس تحقيق غاية وله في ذلك أن يسلك الطرق النظامية من إقامة دعاوى وتقديم بلاغات أو تواصل مع الخصم ... الخ.`;

const PAGE3_DEFAULT = `البند الرابع – التزامات الطرف الثاني-:
.1 تزويد الطرف الأول بجميع المستندات والبيانات المطلوبة بدقة وفي الوقت المحدد.
أ- يقر الطرف الثاني الموكل بأن المعلومات التي قدمها للطرف الأول صحيحة ويتحمل كافة مسؤوليتها القانونية بما في ذلك العناوين والأرقام والأسماء والموقع ويتحمل ما يترتب على عدم دقة البيانات من تأخير لسير العمل وهدر الجهد والوقت.
ب- يقر الطرف الثاني بأن كافة الأوراق والمستندات التي يقدمها عبارة عن صور لا يطالب الطرف الأول بردها للموكل وأن اية صورة للمستندات والوثائق التي يلزم تقديمها للجهات المختصة سيقوم بإحضارها ولا يتحمل الطرف الأول مسؤوليتها.
.2 التعاون التام مع الطرف الأول، وعدم تعيين أي محامٍ آخر في نفس القضية دون موافقة خطية منه.
.3 في حالة قيام الطرف الثاني بالغاء الوكالة الممنوحة لطرف الأول في أي مرحلة من مراحل الدعوى بالإرادة المنفردة تعتبر جميع اتعاب الطرف الأول المالية حاله وواجبة السداد في حينه.
البند الخامس
يتكون هذا العقد من ورقتين، يتضمن خمسة بنود رئيسية بالإضافة إلى التمهيد، ويُعتبر كل منها مكملاً ومفسراً للآخر، وقع من نسختين أصليتين، ولا يُعتد بأي تعديل أو إضافة ما لم يكن مكتوباً وموقعاً من الطرفين.`;

function getTemplate(): HandlebarsTemplateDelegate {
    const source = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    return Handlebars.compile(source);
}

function formatDate(d: Date | null | undefined): string {
    if (!d) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}/${month}/${day}`;
}

function formatAmount(v: any): string {
    if (v === null || v === undefined || v === "") return "";
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return n.toLocaleString("en-US");
}

export function buildLawyerFeesContractContext(c: LawyerFeesContract) {
    return {
        bg_url_1: BG_URL_1,
        bg_url_2: BG_URL_2,
        bg_url_3: BG_URL_3,

        contract_number:    c.contractNumber ?? "",
        contract_day:       c.contractDay    ?? "",
        contract_date:      formatDate(c.contractDate),
        hijri_date:         c.hijriDate      ?? "",

        client_name:        c.clientName     ?? "",
        client_id_number:   c.clientIdNumber ?? "",
        client_phone:       c.clientPhone    ?? "",

        service_description: c.serviceDescription ?? "",

        total_fees:         formatAmount(c.totalFees),
        first_installment:       formatAmount(c.firstInstallment),
        first_installment_note:  c.firstInstallmentNote ?? "",
        second_installment:      formatAmount(c.secondInstallment),
        other_fees:         c.otherFees ?? "",
        currency:           c.currency ?? "SAR",

        page2_content:      c.page2Content ?? PAGE2_DEFAULT,
        page3_content:      c.page3Content ?? PAGE3_DEFAULT,

        first_party_signature_url:  c.firstPartySignature  ?? "",
        second_party_signature_url: c.secondPartySignature ?? "",
        second_party_signed_at:     c.secondPartySignedAt ? formatDate(c.secondPartySignedAt) : "",
    };
}

export async function renderLawyerFeesContractPdf(c: LawyerFeesContract): Promise<Buffer> {
    const html = getTemplate()(buildLawyerFeesContractContext(c));

    const os = await import("node:os");
    const crypto = await import("node:crypto");
    const tmpHtml = path.join(os.tmpdir(), `lawyer-fees-${crypto.randomUUID()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf-8");

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
        const page = await browser.newPage();
        await page.goto(`file://${tmpHtml}`, { waitUntil: ["networkidle0", "domcontentloaded"] });
        await page.evaluate(async () => {
            const weights = ["400", "600", "700", "800", "900"];
            await Promise.all(
                weights.map((w) => (document as any).fonts.load(`${w} 13px "Cairo"`)),
            );
            await (document as any).fonts.ready;

            // Wait for every <img> (including data: URLs for signatures) to finish decoding.
            const imgs = Array.from(document.images);
            await Promise.all(
                imgs.map((img) =>
                    img.complete && img.naturalWidth > 0
                        ? Promise.resolve()
                        : new Promise<void>((resolve) => {
                              img.addEventListener("load",  () => resolve(), { once: true });
                              img.addEventListener("error", () => resolve(), { once: true });
                          }),
                ),
            );
        });

        const pdf = await page.pdf({
            width: "210mm",
            height: "297mm",
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });

        return Buffer.from(pdf);
    } finally {
        await browser.close();
        try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
    }
}
