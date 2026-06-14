import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type { Case, Customer, User } from "@prisma/client";
import { formatSessionHijriDateForDisplay } from "../../core/utils/hijri.js";
import { REPORT_BRANDING } from "./cases.constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(__dirname, "../../views/cases/combined-forms.hbs");
const CLIENT_FORM_BG = path.resolve(__dirname, "../../views/cases/client-form-bg.jpg");
const LAWYER_FORM_BG = path.resolve(__dirname, "../../views/cases/lawyer-form-bg.jpg");
const NOTES_ADD_BG = path.resolve(__dirname, "../../views/cases/notes-add-bg.png");

const CLIENT_FORM_BG_URL = `file://${CLIENT_FORM_BG}`;
const LAWYER_FORM_BG_URL = `file://${LAWYER_FORM_BG}`;
const NOTES_ADD_BG_URL = `file://${NOTES_ADD_BG}`;

function getTemplate(): HandlebarsTemplateDelegate {
    // Read + compile on every call. Cheap relative to Puppeteer launch and
    // means edits to the .hbs file are picked up without restarting the server.
    const source = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    return Handlebars.compile(source);
}

function formatDate(d: Date | null | undefined): string {
    if (!d) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day} / ${month} / ${year}`;
}

type CaseForReport = Case & {
    customer: Pick<Customer, "fullName" | "phone"> | null;
    preferredLawyer: Pick<User, "name"> | null;
    sessionReceiver: Pick<User, "name"> | null;
    // Free-text fallback used when the receiver isn't a system User
    // (e.g. a TEAM_MEMBER picked from the frontend dropdown).
    sessionReceiverName?: string | null;
};

/**
 * Build the Handlebars context from a Case row.
 * The combined template renders BOTH the client-form fields and the lawyer-form fields
 * back-to-back, so this context merges everything both pages need.
 */
export function buildReportContext(c: CaseForReport) {
    const isOther = c.caseType === "OTHER";

    return {
        ...REPORT_BRANDING,
        client_form_bg_url: CLIENT_FORM_BG_URL,
        lawyer_form_bg_url: LAWYER_FORM_BG_URL,
        notes_add_bg_url: NOTES_ADD_BG_URL,

        // Client-form (page 1)
        client_name: c.customer?.fullName ?? "",
        mobile_number: c.customer?.phone ?? "",
        date: formatDate(c.caseDate),
        agency_number: c.agencyNumber ?? "",

        // Case-type checkboxes — one boolean per option
        ct_criminal: c.caseType === "CRIMINAL",
        ct_administrative: c.caseType === "ADMINISTRATIVE",
        ct_labor: c.caseType === "LABOR",
        ct_commercial: c.caseType === "COMMERCIAL",
        ct_penal: c.caseType === "PENAL",
        ct_general: c.caseType === "GENERAL",
        ct_personal_status: c.caseType === "PERSONAL_STATUS",
        ct_other: isOther,
        other_case_type: isOther ? (c.otherCaseType ?? "") : "",

        lawyer_yes: c.wantsSpecificLawyer === true,
        lawyer_no: c.wantsSpecificLawyer === false,
        preferred_lawyer_name: c.preferredLawyer?.name ?? "",

        // Lawyer-form (page 2) — free notes flow as wrapped text;
        // an in-page script (`__cf2Paginate`) measures overflow at render
        // time and spawns continuation pages.
        session_receiver: c.sessionReceiver?.name ?? c.sessionReceiverName ?? "",
        session_date: formatSessionHijriDateForDisplay(c.sessionHijriDate, c.sessionDate),
        free_notes: c.freeNotes ?? "",
    };
}

/**
 * Render the case report to a PDF buffer.
 * The template is the combined client+lawyer forms (single 2-page PDF).
 */
export async function renderCaseReportPdf(c: CaseForReport): Promise<Buffer> {
    const html = getTemplate()(buildReportContext(c));

    // Puppeteer's `page.setContent` uses about:blank as the base URL, which
    // blocks file:// image loads. Navigating to a temp HTML file instead lets
    // the background JPGs resolve.
    const os = await import("node:os");
    const crypto = await import("node:crypto");
    const tmpHtml = path.join(os.tmpdir(), `case-report-${crypto.randomUUID()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf-8");

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
        const page = await browser.newPage();
        await page.goto(`file://${tmpHtml}`, {
            waitUntil: ["networkidle0", "domcontentloaded"],
        });
        // Explicitly load every Cairo weight we use before rendering the PDF,
        // otherwise Puppeteer can snapshot the page before the webfont is ready
        // and fall back to Tahoma/Arial.
        await page.evaluate(async () => {
            const weights = ["400", "600", "700", "800", "900"];
            await Promise.all(
                weights.map((w) => (document as any).fonts.load(`${w} 13px "Cairo"`)),
            );
            await (document as any).fonts.ready;
        });

        // Measure free-notes overflow inside the actual rendered page
        // and inject continuation pages before printing.
        await page.evaluate(async () => {
            const w = window as any;
            if (typeof w.__cf2Paginate === "function") {
                await w.__cf2Paginate();
            }
        });
        await page.waitForFunction(() => (window as any).__cf2PaginationDone === true, {
            timeout: 10000,
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
