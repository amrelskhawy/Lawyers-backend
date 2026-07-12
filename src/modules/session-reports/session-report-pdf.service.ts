import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type { Case, Customer, SessionReport, User } from "@prisma/client";
import { CASE_TYPE_LABELS } from "../cases/cases.constants.js";
import {
    SESSION_REPORT_BRANDING,
    SESSION_REPORT_CLOSING_NOTE,
} from "./session-reports.constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(
    __dirname,
    "../../views/cases/session-report.hbs",
);
const BACKGROUND_PATH = path.resolve(
    __dirname,
    "../../views/cases/session-report-bg.png",
);

// Resolved at module load — the image sits next to the template forever,
// so we reference it via file:// URL (Puppeteer's `page.goto` handles file URLs,
// and embedding 380KB of base64 into HTML balloons the doc and trips setContent).
const BACKGROUND_URL = `file://${BACKGROUND_PATH}`;

function getTemplate(): HandlebarsTemplateDelegate {
    const source = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    return Handlebars.compile(source);
}

function formatDate(d: Date | null | undefined): string {
    if (!d) return "";
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day} / ${month} / ${year}`;
}

type SessionReportWithRelations = SessionReport & {
    case:
        | (Case & {
              customer: Pick<Customer, "fullName" | "phone"> | null;
              preferredLawyer: Pick<User, "name"> | null;
          })
        | null;
};

export function buildSessionReportContext(r: SessionReportWithRelations) {
    const caseTypeLabel =
        CASE_TYPE_LABELS.find((t) => t.value === r.case?.caseType)?.label ?? "";

    return {
        ...SESSION_REPORT_BRANDING,
        background_image_url: BACKGROUND_URL,
        report_number:
            (r.reportNumber && r.reportNumber.trim()) ||
            r.id.slice(0, 4).toUpperCase(),

        customer_name: r.case?.customer?.fullName ?? "",
        mobile_number: r.case?.customer?.phone ?? "",
        case_type: caseTypeLabel,
        case_date: formatDate(r.case?.caseDate ?? null),
        preferred_lawyer: r.case?.preferredLawyer?.name ?? "",

        // Court + case number are owned by the Case (set in the reminders dialog);
        // fall back to the report's own copy for legacy reports created before that.
        court_name: r.case?.courtName ?? r.courtName ?? "",
        court_circuit: r.courtCircuit ?? "",
        case_charge: r.caseCharge ?? "",
        opponent_name: r.opponentName ?? "",
        case_number: r.case?.caseNumber ?? r.caseNumber ?? "",
        case_data: r.caseData ?? "",
        session_ordinal: r.sessionOrdinal ?? "",
        attendance_ordinal: r.attendanceOrdinal ?? "",
        session_time: r.sessionTime ?? "",
        hijri_date: r.hijriDate ?? "",

        session_title: r.sessionTitle ?? "",
        session_date: formatDate(r.sessionDate),
        gregorian_date: formatDate(r.sessionDate),
        session_summary: r.sessionSummary ?? "",
        court_decision: r.courtDecision ?? "",
        lawyer_notes: r.lawyerNotes ?? "",
        next_session_date: formatDate(r.nextSessionDate),

        closing_note: r.closingNote ?? SESSION_REPORT_CLOSING_NOTE,
    };
}

export async function renderSessionReportPdf(
    r: SessionReportWithRelations,
): Promise<Buffer> {
    const html = getTemplate()(buildSessionReportContext(r));

    // Write the rendered HTML to a temp file and navigate Puppeteer to it.
    // page.setContent uses `about:blank` as base URL which blocks `file://`
    // image loads — navigating via file:// lets the background PNG load.
    const os = await import("node:os");
    const crypto = await import("node:crypto");
    const tmpHtml = path.join(
        os.tmpdir(),
        `session-report-${crypto.randomUUID()}.html`,
    );
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
        try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
    }
}
