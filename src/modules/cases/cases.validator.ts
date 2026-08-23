import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppResponse } from "../../core/utils/AppResponse.js";

const CaseTypeEnum = z.enum([
    "CRIMINAL",
    "ADMINISTRATIVE",
    "LABOR",
    "COMMERCIAL",
    "PENAL",
    "GENERAL",
    "PERSONAL_STATUS",
    "OTHER",
]);

// Litigation degree (درجة التقاضي) — set from the reminders dialog.
const CaseDegreeEnum = z.enum([
    "FIRST_INSTANCE",
    "APPEAL",
    "CASSATION",
    "PETITION",
    "OTHER",
]);

const isoDate = z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date");

export const CreateCaseSchema = z.object({
    customerId: z.string().uuid(),
    caseType: CaseTypeEnum,
    otherCaseType: z.string().optional(),
    caseDate: isoDate,
    hijriDate: z.string().optional(),
    agencyNumber: z.string().optional(),
    isRealCustomer: z.boolean().optional(),
    isCompany: z.boolean().optional(),
    // Only meaningful when isCompany is false — the lawyer who brought the client.
    sourceLawyerId: z.string().uuid().nullable().optional(),
});

// General case update — assignment fields are excluded (use /assign endpoint)
export const UpdateCaseSchema = z
    .object({
        customerId: z.string().uuid().optional(),
        caseType: CaseTypeEnum.optional(),
        otherCaseType: z.string().nullable().optional(),
        caseDegree: CaseDegreeEnum.nullable().optional(),
        caseDate: isoDate.optional(),
        hijriDate: z.string().nullable().optional(),
        agencyNumber: z.string().nullable().optional(),

        sessionReceiverId: z.string().uuid().nullable().optional(),
        sessionReceiverName: z.string().nullable().optional(),

        isRealCustomer: z.boolean().optional(),
        isCompany: z.boolean().optional(),
        sourceLawyerId: z.string().uuid().nullable().optional(),
        hasStructuredNotes: z.boolean().optional(),
        weaknesses: z.array(z.string()).optional(),
        strengths: z.array(z.string()).optional(),
        gaps: z.array(z.string()).optional(),
        freeNotes: z.string().nullable().optional(),
    })
    .strict();

// A case has two independent assignment slots: one LAWYER, one CONSULTANT.
export const AssignmentKindEnum = z.enum(["LAWYER", "CONSULTANT"]);

// Assignment — only staff (admin/moderator/receptionist) can send this.
// `kind` selects which slot (lawyer vs consultant) to assign.
export const AssignCaseSchema = z.object({
    lawyerId: z.string().uuid(),
    lawyerName: z.string().optional(),
    kind: AssignmentKindEnum,
}).strict();

// Unassign — clears the given slot.
export const UnassignCaseSchema = z.object({
    kind: AssignmentKindEnum,
}).strict();

// Stand-in — names who covers a slot while its holder is away, or clears it
// with a null `userId`. No accept/reject of its own: it takes effect at once.
export const SetStandInSchema = z.object({
    kind: AssignmentKindEnum,
    userId: z.string().uuid().nullable(),
    userName: z.string().optional(),
}).strict();

// Assignment rejection — the assigned lawyer must give a reason
export const RejectAssignmentSchema = z.object({
    reason: z.string().trim().min(1, "Rejection reason is required"),
}).strict();

// Setting the (Hijri) session date — triggers auto-scheduling of the 3 reminders.
// `sessionHijriDate` is iYYYY-iMM-iDD (e.g. "1447-12-15"); `sessionTime` is HH:mm.
// Passing both as `null` clears the session date and cancels the pending reminders.
export const SetSessionDateSchema = z
    .object({
        sessionHijriDate: z
            .string()
            .trim()
            .regex(/^\d{4}-\d{1,2}-\d{1,2}$/, "Expected Hijri date as iYYYY-iMM-iDD")
            .nullable(),
        sessionTime: z
            .string()
            .trim()
            .regex(/^\d{1,2}:\d{2}$/, "Expected time as HH:mm")
            .nullable(),
    })
    .strict()
    .refine((d) => (d.sessionHijriDate == null) === (d.sessionTime == null), {
        message: "sessionHijriDate and sessionTime must be set or cleared together",
        path: ["sessionHijriDate"],
    });

// Setting the court (المحكمة) + case number (رقم القضية) from the reminders dialog.
// Empty strings are treated as "clear" by the service.
export const SetCourtInfoSchema = z
    .object({
        courtName: z.string().trim().max(200).nullable().optional(),
        caseNumber: z.string().trim().max(100).nullable().optional(),
    })
    .strict();

// Toggling the "fully completed" state of a case.
export const SetCompletionSchema = z.object({
    completed: z.boolean(),
}).strict();

// Setting the litigation degree from the reminders dialog.
export const SetCaseDegreeSchema = z
    .object({
        caseDegree: CaseDegreeEnum,
        otherDegreeText: z.string().max(200).optional(),
    })
    .refine(
        (d) => d.caseDegree !== "OTHER" || (d.otherDegreeText != null && d.otherDegreeText.trim().length > 0),
        { message: "otherDegreeText is required when degree is OTHER", path: ["otherDegreeText"] },
    );

export type CreateCasePayload = z.infer<typeof CreateCaseSchema>;
export type UpdateCasePayload = z.infer<typeof UpdateCaseSchema>;
export type AssignCasePayload = z.infer<typeof AssignCaseSchema>;
export type UnassignCasePayload = z.infer<typeof UnassignCaseSchema>;
export type SetStandInPayload = z.infer<typeof SetStandInSchema>;
export type AssignmentKind = z.infer<typeof AssignmentKindEnum>;
export type RejectAssignmentPayload = z.infer<typeof RejectAssignmentSchema>;
export type SetSessionDatePayload = z.infer<typeof SetSessionDateSchema>;
export type SetCaseDegreePayload = z.infer<typeof SetCaseDegreeSchema>;
export type SetCourtInfoPayload = z.infer<typeof SetCourtInfoSchema>;

export const validateCreateCase = (req: Request, res: Response, next: NextFunction) => {
    const result = CreateCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUpdateCase = (req: Request, res: Response, next: NextFunction) => {
    const result = UpdateCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateAssignCase = (req: Request, res: Response, next: NextFunction) => {
    const result = AssignCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateUnassignCase = (req: Request, res: Response, next: NextFunction) => {
    const result = UnassignCaseSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetStandIn = (req: Request, res: Response, next: NextFunction) => {
    const result = SetStandInSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateRejectAssignment = (req: Request, res: Response, next: NextFunction) => {
    const result = RejectAssignmentSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetSessionDate = (req: Request, res: Response, next: NextFunction) => {
    const result = SetSessionDateSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetCompletion = (req: Request, res: Response, next: NextFunction) => {
    const result = SetCompletionSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetCaseDegree = (req: Request, res: Response, next: NextFunction) => {
    const result = SetCaseDegreeSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};

export const validateSetCourtInfo = (req: Request, res: Response, next: NextFunction) => {
    const result = SetCourtInfoSchema.safeParse(req.body);
    if (!result.success) {
        return res
            .status(400)
            .json(new AppResponse(false, "VALIDATION_ERROR", result.error.format(), 400));
    }
    req.body = result.data;
    next();
};
