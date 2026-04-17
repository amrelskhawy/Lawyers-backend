import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type { Case, Customer, User } from "@prisma/client";
import { REPORT_BRANDING, REPORT_REQUIREMENTS, CASE_TYPE_LABELS } from "./cases.constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(__dirname, "../../views/cases/combined-forms.hbs");

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
};

/**
 * Build the Handlebars context from a Case row.
 * The combined template renders BOTH the client-form fields and the lawyer-form fields
 * back-to-back, so this context merges everything both pages need.
 */
export function buildReportContext(c: CaseForReport) {
    return {
        ...REPORT_BRANDING,

        // Client-form (page 1)
        client_name: c.customer?.fullName ?? "",
        mobile_number: c.customer?.phone ?? "",
        date: formatDate(c.caseDate),
        hijri_date: c.hijriDate ?? "",
        agency_number: c.agencyNumber ?? "",
        case_types: CASE_TYPE_LABELS.map((t) => ({
            label: t.value === "OTHER" && c.otherCaseType
                ? `أخرى: ${c.otherCaseType}`
                : t.label,
            checked: t.value === c.caseType,
        })),
        // legacy split rows used by combined template
        case_types_row1: CASE_TYPE_LABELS.slice(0, 4).map((t) => ({
            label: t.label,
            checked: t.value === c.caseType,
        })),
        case_types_row2: CASE_TYPE_LABELS.slice(4).map((t) => ({
            label: t.value === "OTHER" && c.otherCaseType
                ? `أخرى: ${c.otherCaseType}`
                : t.label,
            checked: t.value === c.caseType,
        })),
        lawyer_preference_yes: c.wantsSpecificLawyer === true,
        lawyer_preference_no: c.wantsSpecificLawyer === false,
        lawyer_yes: c.wantsSpecificLawyer === true,
        lawyer_no: c.wantsSpecificLawyer === false,
        preferred_lawyer_name: c.preferredLawyer?.name ?? "",
        preferred_lawyer: c.preferredLawyer?.name ?? "",
        requirements: REPORT_REQUIREMENTS,

        // Lawyer-form (page 2)
        session_receiver: c.sessionReceiver?.name ?? "",
        session_date: formatDate(c.sessionDate),
        has_structured_notes: c.hasStructuredNotes,
        weaknesses: c.weaknesses ?? [],
        strengths: c.strengths ?? [],
        gaps: c.gaps ?? [],
        // Free-form fallback: 15 blank lines, prefilled from freeNotes split by newlines.
        lines: (c.freeNotes ?? "")
            .split("\n")
            .concat(Array(15).fill(""))
            .slice(0, 15),
    };
}

/**
 * Render the case report to a PDF buffer.
 * The template is the combined client+lawyer forms (single 2-page PDF).
 */
export async function renderCaseReportPdf(c: CaseForReport): Promise<Buffer> {
    const html = getTemplate()(buildReportContext(c));

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: ["networkidle0", "domcontentloaded"] });
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

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });

        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}
