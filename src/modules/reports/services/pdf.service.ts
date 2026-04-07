import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { SessionReport, CaseType } from '@prisma/client';
import logger from '../../core/utils/logger'; // adjust to your logger path

// ── Storage root on the VPS ──────────────────────────────────────────────────
const STORAGE_DIR = path.join(process.cwd(), 'storage', 'reports');

// Ensure the directory exists at startup
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// ── Template compilation (cached) ────────────────────────────────────────────
const TEMPLATE_PATH = path.join(process.cwd(), 'src', 'modules', 'reports', 'templates', 'session-report.hbs');
let compiledTemplate: HandlebarsTemplateDelegate | null = null;

function getTemplate(): HandlebarsTemplateDelegate {
  if (!compiledTemplate) {
    const source = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    compiledTemplate = Handlebars.compile(source);
  }
  return compiledTemplate;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

function buildTemplateData(report: SessionReport) {
  return {
    // Page 1 – Client
    clientName: report.clientName,
    clientPhone: report.clientPhone,
    clientDate: formatDate(report.clientDate),

    // Case type booleans (exactly one will be true)
    isCriminal: report.caseType === CaseType.CRIMINAL,
    isAdministrative: report.caseType === CaseType.ADMINISTRATIVE,
    isLabor: report.caseType === CaseType.LABOR,
    isCommercial: report.caseType === CaseType.COMMERCIAL,
    isPersonal: report.caseType === CaseType.PERSONAL_STATUS,
    isGeneral: report.caseType === CaseType.GENERAL,

    // Lawyer
    specificLawyerYes: report.specificLawyerRequested === true,
    specificLawyerNo: report.specificLawyerRequested === false,
    lawyerName: report.lawyerName ?? '',

    // Documents checklist
    hasIdCopy: report.hasIdCopy,
    hasAbsherMobile: report.hasAbsherMobile,
    hasNationalAddress: report.hasNationalAddress,
    hasDocumentsCopy: report.hasDocumentsCopy,
    hasTawakkalna: report.hasTawakkalna,

    // Page 2 – Lawyer session
    sessionReceiverName: report.sessionReceiverName ?? '—',
    sessionDate: formatDate(report.sessionDate),
    strengths: report.strengths ?? '',
    weaknesses: report.weaknesses ?? '',
    gaps: report.gaps ?? '',
  };
}

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateReportPDF(report: SessionReport): Promise<{
  pdfPath: string;
  pdfUrl: string;
}> {
  const template = getTemplate();
  const html = template(buildTemplateData(report));

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // important on VPS with limited /dev/shm
    ],
  });

  try {
    const page = await browser.newPage();

    // Set content and wait for Arabic fonts to load
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // A4 page dimensions
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });

    const fileName = `report_${report.id}_${Date.now()}.pdf`;
    const filePath = path.join(STORAGE_DIR, fileName);

    fs.writeFileSync(filePath, pdfBuffer);

    // Public URL — served from /storage/reports/:filename via Express static middleware
    const fileUrl = `/storage/reports/${fileName}`;

    logger.info(`PDF generated: ${filePath}`);

    return { pdfPath: filePath, pdfUrl: fileUrl };
  } finally {
    await browser.close();
  }
}
