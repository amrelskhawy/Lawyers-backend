/**
 * One-time migration: split the old single assignment slot into two.
 *
 * Before this change a case had ONE assignment slot (`preferredLawyer*`) that
 * held either a lawyer OR a consultant. Now lawyers and consultants live in
 * separate slots. Any existing case whose `preferredLawyer` is actually a
 * CONSULTANT must be moved into the new consultant slot, then have its lawyer
 * slot cleared.
 *
 * Safe to run multiple times (idempotent): once moved, the lawyer slot no longer
 * points at a consultant, so re-running is a no-op.
 *
 *   npx tsx scripts/migrate-consultant-assignments.ts
 */
import prisma from "../src/core/db/prisma.js";

async function main() {
    const cases = await prisma.case.findMany({
        where: { preferredLawyerId: { not: null } },
        include: { preferredLawyer: { select: { id: true, role: true } } },
    });

    let moved = 0;
    for (const c of cases) {
        if (c.preferredLawyer?.role !== "CONSULTANT") continue;

        await prisma.case.update({
            where: { id: c.id },
            data: {
                // Move lawyer-slot values → consultant slot
                consultantId: c.preferredLawyerId,
                consultantName: c.preferredLawyerName,
                consultantAssignmentStatus: c.assignmentStatus,
                consultantAssignmentRejectedAt: c.assignmentRejectedAt,
                consultantAssignmentRejectionReason: c.assignmentRejectionReason,
                // Clear the lawyer slot
                preferredLawyerId: null,
                preferredLawyerName: null,
                assignmentStatus: "UNASSIGNED",
                assignmentRejectedAt: null,
                assignmentRejectionReason: null,
                wantsSpecificLawyer: false,
            },
        });
        moved++;
    }

    console.log(`Migrated ${moved} consultant assignment(s) out of ${cases.length} assigned case(s).`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
