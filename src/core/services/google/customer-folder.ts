import prisma from "../../db/prisma.js";
import { AppResponse } from "../../utils/AppResponse.js";
import { driveService } from "./drive.js";

/**
 * Resolve (creating if necessary) the Drive folder for a customer's case files.
 * Each customer gets a single sub-folder under the configured root, reused for
 * reports, contracts, and uploaded attachments. The folder id is cached on the
 * customer row so it's created at most once.
 */
export async function ensureCustomerFolder(customerId: string): Promise<string> {
    const rootFolderId = process.env.GOOGLE_DRIVE_CASE_REPORTS_FOLDER_ID;
    if (!rootFolderId) {
        throw new AppResponse(false, "CASE_REPORTS_FOLDER_NOT_CONFIGURED", null, 500);
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
        throw new AppResponse(false, "CUSTOMER_NOT_FOUND", null, 404);
    }

    if (customer.caseReportsFolderId) {
        return customer.caseReportsFolderId;
    }

    const folder = await driveService.createFolder(
        `${customer.fullName} (${customer.id.slice(0, 8)})`,
        rootFolderId,
    );

    if (!folder.id) {
        throw new AppResponse(false, "DRIVE_FOLDER_CREATE_FAILED", null, 500);
    }

    await prisma.customer.update({
        where: { id: customerId },
        data: { caseReportsFolderId: folder.id },
    });

    return folder.id;
}
