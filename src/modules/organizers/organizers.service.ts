import prisma from "../../core/db/prisma.js";
import { AppResponse } from "../../core/utils/AppResponse.js";
import { sendEmailWithTemplate } from "../../core/utils/email.js";
import { format } from "date-fns";
import { CreateOrganizerPayload, UpdateOrganizerPayload } from "./organizers.types.js";

type BookingEvent = "booked" | "confirmed" | "cancelled";

interface BookingNotificationPayload {
    date: string | Date;
    startTime: string;
    endTime: string;
    status: string;
    meetLink?: string | null;
    customer?: { fullName: string; email: string | null } | null;
    service?: { name_en: string } | null;
    name?: string;
    clientEmail?: string;
}

const EVENT_LABELS: Record<BookingEvent, string> = {
    booked: "New Booking",
    confirmed: "Booking Confirmed",
    cancelled: "Booking Cancelled",
};

const SUBJECT_PREFIXES: Record<BookingEvent, string> = {
    booked: "New Booking",
    confirmed: "Booking Confirmed",
    cancelled: "Booking Cancelled",
};

const includeUser = { user: { select: { id: true, name: true, email: true, role: true } } } as const;

export class OrganizerService {
    async getAllOrganizers() {
        return await prisma.organizer.findMany({
            include: includeUser,
            orderBy: { createdAt: "desc" },
        });
    }

    async getOrganizerById(id: string) {
        const organizer = await prisma.organizer.findUnique({
            where: { id },
            include: includeUser,
        });
        if (!organizer) {
            throw new AppResponse(false, "ORGANIZER_NOT_FOUND", null, 404);
        }
        return organizer;
    }

    async createOrganizer(payload: CreateOrganizerPayload) {
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user) {
            throw new AppResponse(false, "USER_NOT_FOUND", null, 404);
        }

        const existing = await prisma.organizer.findUnique({
            where: { userId: payload.userId },
        });
        if (existing) {
            throw new AppResponse(false, "USER_ALREADY_ORGANIZER", null, 409);
        }

        return await prisma.organizer.create({
            data: { userId: payload.userId },
            include: includeUser,
        });
    }

    async updateOrganizer(id: string, payload: UpdateOrganizerPayload) {
        const existing = await prisma.organizer.findUnique({ where: { id } });
        if (!existing) {
            throw new AppResponse(false, "ORGANIZER_NOT_FOUND", null, 404);
        }

        return await prisma.organizer.update({
            where: { id },
            data: { isActive: payload.isActive },
            include: includeUser,
        });
    }

    async deleteOrganizer(id: string) {
        const existing = await prisma.organizer.findUnique({ where: { id } });
        if (!existing) {
            throw new AppResponse(false, "ORGANIZER_NOT_FOUND", null, 404);
        }

        await prisma.organizer.delete({ where: { id } });
        return { message: "ORGANIZER_DELETED_SUCCESS" };
    }

    async deleteMultipleOrganizers(ids: string[]) {
        const result = await prisma.organizer.deleteMany({
            where: { id: { in: ids } },
        });
        return { deletedCount: result.count };
    }

    /**
     * Notify all active organizers about a booking event.
     * Best-effort: failures are logged, never block the caller.
     */
    async notifyOrganizers(event: BookingEvent, booking: BookingNotificationPayload) {
        const organizers = await prisma.organizer.findMany({
            where: { isActive: true },
            include: includeUser,
        });

        if (organizers.length === 0) return;

        const serviceName = booking.service?.name_en || "Service";
        const subject = `${SUBJECT_PREFIXES[event]} — ${serviceName}`;

        const parsedDate = new Date(booking.date);
        const formattedDate = isNaN(parsedDate.getTime()) ? "Invalid date" : format(parsedDate, "yyyy-MM-dd");

        const context = {
            event,
            event_label: EVENT_LABELS[event],
            customer_name: booking.customer?.fullName || booking.name || "N/A",
            customer_email: booking.customer?.email || booking.clientEmail || "N/A",
            service_name: serviceName,
            date: formattedDate,
            start_time: booking.startTime,
            end_time: booking.endTime,
            meet_link: booking.meetLink || null,
            status: booking.status,
        };

        const results = await Promise.allSettled(
            organizers.map((org) =>
                sendEmailWithTemplate(
                    org.user.email,
                    subject,
                    "organizerNotification",
                    { ...context, organizer_name: org.user.name }
                )
            )
        );

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - succeeded;

        results.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`[Email] Failed to notify organizer ${organizers[i].user.email}:`, r.reason?.message);
            }
        });

        console.log(`[Organizer] Notification summary for "${event}": ${succeeded} sent, ${failed} failed`);
    }
}
