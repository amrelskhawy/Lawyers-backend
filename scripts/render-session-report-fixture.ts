import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSessionReportPdf } from "../src/modules/session-reports/session-report-pdf.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fixture data matching the filled example from the DOCX template.
const fixture: any = {
    id: "DEADBEEF-0000-0000-0000-000000000000",
    caseId: "case-1",
    sessionDate: new Date("2026-03-31"),
    sessionTitle: null,
    sessionSummary:
        "تم طلب الإفراج عن المدعى عليه بسبب تدهور حالته الصحية، ورفضت المحكمة الطلب. وقال الشيخ (انها من القضايا الموجبة للتوقيف.. ولكن قم برفع الطلب ونخاطب المستشفى هل يستطيع السجن أو لا.. وعلماً بأنه تم طلب مهلة للرد على لائحة الاتهام، ووافقت المحكمة على منح المهلة والسجن هو المسؤول عن توفير الرعاية الطبية اللازمة.)",
    courtDecision: null,
    lawyerNotes: null,
    nextSessionDate: null,
    courtName: "المحكمة الجزائية بالرياض",
    courtCircuit: "الرياض",
    caseCharge: "تعزير – مخالفة النظام الجزائي لجرائم التزوير",
    opponentName: "هيئة الرقابة ومكافحة الفساد",
    caseNumber: "4772688750",
    sessionOrdinal: "السابعة عشر بعد المائة",
    attendanceOrdinal: "الثانية",
    sessionTime: "08 : 00 ص",
    hijriDate: "12 / 10 / 1447",
    closingNote: null,
    reportFileId: null,
    reportUrl: null,
    sentToClientAt: null,
    createdById: "test",
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    case: {
        id: "case-1",
        caseType: "PENAL",
        caseDate: new Date("2026-03-31"),
        customer: {
            fullName: "صالح عمر صالح العامري",
            phone: "0555555555",
        },
        preferredLawyer: { name: "" },
    },
};

async function main() {
    const pdf = await renderSessionReportPdf(fixture);
    const out = path.resolve(__dirname, "../tmp-session-report-fixture.pdf");
    fs.writeFileSync(out, pdf);
    console.log(`Wrote ${out} (${pdf.length} bytes)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
