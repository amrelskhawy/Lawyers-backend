import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type { FieldVisitReport } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(__dirname, "../../views/field-visit/field-visit-report.hbs");
const BACKGROUND_PATH = path.resolve(__dirname, "../../views/field-visit/field-visit-bg.png");
const BACKGROUND_URL = `file://${BACKGROUND_PATH}`;

function getTemplate(): HandlebarsTemplateDelegate {
    const source = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    return Handlebars.compile(source);
}

function formatDate(d: Date | null | undefined): string {
    if (!d) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day} / ${month} / ${d.getFullYear()}`;
}

export function buildFieldVisitReportContext(r: FieldVisitReport) {
    return {
        background_image_url: BACKGROUND_URL,
        review_lawyer:  r.reviewLawyer  ?? "",
        review_place:   r.reviewPlace   ?? "",
        agency_number:  r.agencyNumber  ?? "",
        client_name:    r.clientName    ?? "",
        case_number:    r.caseNumber    ?? "",
        review_date:    formatDate(r.reviewDate),
        report_summary: r.reportSummary ?? "",
    };
}

export async function renderFieldVisitReportPdf(r: FieldVisitReport): Promise<Buffer> {
    const html = getTemplate()(buildFieldVisitReportContext(r));

    const os = await import("node:os");
    const crypto = await import("node:crypto");
    const tmpHtml = path.join(os.tmpdir(), `field-visit-${crypto.randomUUID()}.html`);
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
        });

        const pdf = await page.pdf({
            width: "210mm",
            height: "280mm",
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
