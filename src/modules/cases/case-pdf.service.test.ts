import { describe, expect, it } from "vitest";
import { buildReportContext } from "./case-pdf.service.js";

describe("buildReportContext", () => {
    const base = {
        id: "case-1",
        customerId: "cust-1",
        caseType: "LABOR" as const,
        otherCaseType: null,
        caseDegree: null,
        caseDate: new Date("2026-03-15T12:00:00.000Z"),
        hijriDate: null,
        agencyNumber: "123",
        wantsSpecificLawyer: false,
        preferredLawyerId: null,
        preferredLawyerName: null,
        assignmentStatus: "UNASSIGNED" as const,
        assignmentRejectedAt: null,
        assignmentRejectionReason: null,
        consultantId: null,
        consultantName: null,
        consultantAssignmentStatus: "UNASSIGNED" as const,
        consultantAssignmentRejectedAt: null,
        consultantAssignmentRejectionReason: null,
        sessionReceiverId: null,
        sessionReceiverName: "أ. خالد",
        sessionHijriDate: "1447-12-15",
        sessionTime: "09:00",
        sessionDate: new Date("2026-06-04T06:00:00.000Z"),
        hasStructuredNotes: false,
        weaknesses: [],
        strengths: [],
        gaps: [],
        freeNotes: "",
        reportFileId: null,
        reportUrl: null,
        reportGeneratedAt: null,
        sentToClientAt: null,
        completedAt: null,
        completedById: null,
        needsMemo: false,
        memoDeadline: null,
        memoType: null,
        createdById: "user-1",
        updatedById: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        customer: { fullName: "عميل", phone: "0500000000" },
        preferredLawyer: null,
        sessionReceiver: null,
    };

    it("uses canonical Hijri session date in the lawyer-form PDF field", () => {
        const ctx = buildReportContext(base);
        expect(ctx.session_date).toBe("15 / 12 / 1447");
    });

    it("derives Hijri session date from Gregorian when canonical is missing", () => {
        const ctx = buildReportContext({ ...base, sessionHijriDate: null });
        expect(ctx.session_date).toMatch(/\d{2} \/ \d{2} \/ \d{4}/);
        expect(ctx.session_date).not.toBe("04 / 06 / 2026");
    });
});
