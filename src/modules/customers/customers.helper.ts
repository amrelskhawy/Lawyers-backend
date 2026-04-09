import prisma from "../../core/db/prisma.js";

/**
 * Find or create a customer by email.
 * If the customer exists (even soft-deleted), update their info and restore them.
 * Returns the customer id.
 */
export async function upsertCustomerFromBooking(data: {
    fullName: string;
    email: string;
    phone: string;
}): Promise<string> {
    const existing = await prisma.customer.findFirst({
        where: { email: data.email },
    });

    if (existing) {
        const updated = await prisma.customer.update({
            where: { id: existing.id },
            data: {
                fullName: data.fullName,
                phone: data.phone,
                isDeleted: false,
            },
        });
        return updated.id;
    }

    const customer = await prisma.customer.create({
        data: {
            fullName: data.fullName,
            email: data.email,
            phone: data.phone,
        },
    });

    return customer.id;
}
