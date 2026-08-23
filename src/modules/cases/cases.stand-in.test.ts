import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
    case: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
};

vi.mock("../../core/db/prisma.js", () => ({ default: prismaMock }));
// Collaborators pulled in transitively by the service — stub to no-ops.
vi.mock("../../core/services/google/drive.js", () => ({ driveService: {} }));
vi.mock("../../core/services/google/customer-folder.js", () => ({ ensureCustomerFolder: vi.fn() }));
vi.mock("../../core/services/waapi/waapi.service.js", () => ({
    sendWhatsAppFile: vi.fn(),
    sendWhatsAppMessage: vi.fn(),
}));
vi.mock("../../core/utils/email.js", () => ({ sendEmailWithTemplate: vi.fn() }));
vi.mock("./case-pdf.service.js", () => ({ renderCaseReportPdf: vi.fn() }));

const { CasesService } = await import("./cases.service.js");

const cases = new CasesService();
const ADMIN = "u-admin";
const HOLDER = "u-lawyer";
const STAND_IN = "u-stand-in";

/** A case whose lawyer slot has an accepted holder and no stand-in yet. */
function assignedCase(overrides: Record<string, unknown> = {}) {
    return {
        id: "c1",
        isDeleted: false,
        preferredLawyerId: HOLDER,
        assignmentStatus: "ACCEPTED",
        consultantId: null,
        consultantAssignmentStatus: "UNASSIGNED",
        tempLawyerId: null,
        tempConsultantId: null,
        sessionReceiverId: null,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.case.update.mockResolvedValue({});
    prismaMock.case.findMany.mockResolvedValue([]);
});

describe("CasesService.setStandIn", () => {
    it("names a stand-in on a slot that has a holder", async () => {
        prismaMock.case.findUnique.mockResolvedValue(assignedCase());
        prismaMock.user.findUnique.mockResolvedValue({ id: STAND_IN, name: "أ. بديل", role: "LAWYER" });

        await cases.setStandIn("c1", { kind: "LAWYER", userId: STAND_IN }, ADMIN);

        expect(prismaMock.case.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    tempLawyer: { connect: { id: STAND_IN } },
                    tempLawyerName: "أ. بديل",
                }),
            }),
        );
    });

    it("clears the stand-in when userId is null — even with no holder", async () => {
        prismaMock.case.findUnique.mockResolvedValue(
            assignedCase({ preferredLawyerId: null, assignmentStatus: "UNASSIGNED", tempLawyerId: STAND_IN }),
        );

        await cases.setStandIn("c1", { kind: "LAWYER", userId: null }, ADMIN);

        expect(prismaMock.case.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    tempLawyer: { disconnect: true },
                    tempLawyerName: null,
                }),
            }),
        );
        expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("refuses a stand-in for an empty slot", async () => {
        prismaMock.case.findUnique.mockResolvedValue(
            assignedCase({ preferredLawyerId: null, assignmentStatus: "UNASSIGNED" }),
        );

        await expect(
            cases.setStandIn("c1", { kind: "LAWYER", userId: STAND_IN }, ADMIN),
        ).rejects.toMatchObject({ message: "CASE_NOT_ASSIGNED" });
        expect(prismaMock.case.update).not.toHaveBeenCalled();
    });

    it("refuses to make the holder their own stand-in", async () => {
        prismaMock.case.findUnique.mockResolvedValue(assignedCase());

        await expect(
            cases.setStandIn("c1", { kind: "LAWYER", userId: HOLDER }, ADMIN),
        ).rejects.toMatchObject({ message: "CASE_STAND_IN_IS_ASSIGNEE" });
        expect(prismaMock.case.update).not.toHaveBeenCalled();
    });

    it("refuses a stand-in whose role does not match the slot", async () => {
        prismaMock.case.findUnique.mockResolvedValue(
            assignedCase({ consultantId: "u-consultant", consultantAssignmentStatus: "ACCEPTED" }),
        );
        prismaMock.user.findUnique.mockResolvedValue({ id: STAND_IN, name: "أ. بديل", role: "LAWYER" });

        await expect(
            cases.setStandIn("c1", { kind: "CONSULTANT", userId: STAND_IN }, ADMIN),
        ).rejects.toMatchObject({ message: "CASE_ASSIGN_INVALID_LAWYER" });
        expect(prismaMock.case.update).not.toHaveBeenCalled();
    });
});

describe("CasesService.unassign", () => {
    it("clears the slot's stand-in along with the holder", async () => {
        prismaMock.case.findUnique.mockResolvedValue(assignedCase({ tempLawyerId: STAND_IN }));

        await cases.unassign("c1", ADMIN, "LAWYER");

        expect(prismaMock.case.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    preferredLawyer: { disconnect: true },
                    tempLawyer: { disconnect: true },
                    tempLawyerName: null,
                }),
            }),
        );
    });
});

describe("case visibility", () => {
    it("a stand-in sees the case in their own list", async () => {
        await cases.list({ id: STAND_IN, role: "LAWYER" });

        const { where } = prismaMock.case.findMany.mock.calls[0]![0];
        const roleScope = where.AND.find((clause: any) => clause.OR?.some((o: any) => "preferredLawyerId" in o));
        expect(roleScope.OR).toEqual(
            expect.arrayContaining([{ tempLawyerId: STAND_IN }, { tempConsultantId: STAND_IN }]),
        );
    });
});
