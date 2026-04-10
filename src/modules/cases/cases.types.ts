import type { Case, Customer, User } from "@prisma/client";

export type CaseWithRelations = Case & {
    customer: Pick<Customer, "id" | "fullName" | "email" | "phone"> | null;
    preferredLawyer: Pick<User, "id" | "name"> | null;
    sessionReceiver: Pick<User, "id" | "name"> | null;
    createdBy: Pick<User, "id" | "name"> | null;
};
