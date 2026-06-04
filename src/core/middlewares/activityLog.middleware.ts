import { Response, NextFunction } from "express";
import prisma from "../db/prisma.js";
import type { AuthRequest } from "./authMiddleware.js";

function extractDetails(action: string, resource: string, reqBody: any, resData: any): Record<string, any> | null {
    if (action === "LIST") {
        const arr = Array.isArray(resData) ? resData : null;
        return arr ? { count: arr.length } : null;
    }

    const d = resData;
    if (!d || typeof d !== "object") return null;

    switch (resource) {
        case "Case":
            return {
                customer: d.customer?.fullName ?? d.customerId ?? null,
                caseType: d.caseType ?? null,
                assignmentStatus: d.assignmentStatus ?? null,
                lawyer: d.preferredLawyerName ?? d.preferredLawyer?.name ?? null,
            };
        case "Booking":
            return {
                customer: d.customer?.fullName ?? d.customerId ?? null,
                service: d.service?.title ?? null,
                status: d.status ?? null,
                amount: d.totalAmount ?? null,
            };
        case "Customer":
            return {
                name: d.fullName ?? null,
                phone: d.phone ?? null,
                email: d.email ?? null,
            };
        case "User":
            return { name: d.name ?? null, email: d.email ?? null, role: d.role ?? null };
        case "SessionReport":
            return { case: d.case?.id ?? d.caseId ?? null, notes: d.notes ? String(d.notes).slice(0, 80) : null };
        case "FieldVisitReport":
            return { case: d.caseId ?? null };
        case "LawyerFeesContract":
            return { case: d.caseId ?? null, amount: d.amount ?? null };
        default:
            return null;
    }
}

export const logActivity = (
    action: string,
    resource: string,
    getResourceId?: (req: AuthRequest) => string | undefined,
) =>
    (req: AuthRequest, res: Response, next: NextFunction) => {
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
            if (res.statusCode < 400 && req.user?.id) {
                const details = extractDetails(action, resource, req.body, body?.data);
                prisma.activityLog
                    .create({
                        data: {
                            userId: req.user.id,
                            action,
                            resource,
                            resourceId: getResourceId?.(req) ?? (req.params?.id as string | undefined) ?? null,
                            details: details ?? undefined,
                            ipAddress: (Array.isArray(req.headers["x-forwarded-for"]) ? req.headers["x-forwarded-for"][0] : req.headers["x-forwarded-for"])?.split(",")[0].trim() ?? req.ip ?? null,
                        },
                    })
                    .catch((err) => console.error("[ActivityLog] write failed:", err));
            }
            return originalJson(body);
        };
        next();
    };
