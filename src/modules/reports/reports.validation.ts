import { z } from 'zod';

export const CaseTypeEnum = z.enum([
  'CRIMINAL',
  'ADMINISTRATIVE',
  'LABOR',
  'COMMERCIAL',
  'PERSONAL_STATUS',
  'GENERAL',
]);

export const CreateSessionReport = z.object({
  client: z.object({
    name: z.string().min(2, 'Client name is required'),
    phone: z.string().min(9, 'Valid phone number is required'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    caseType: CaseTypeEnum,
  }),
  lawyer: z.object({
    name: z.string().optional(),
    specificLawyerRequested: z.boolean().default(false),
  }),
  documents: z.object({
    idCopy: z.boolean().default(false),
    absherMobile: z.boolean().default(false),
    nationalAddress: z.boolean().default(false),
    documentsCopy: z.boolean().default(false),
    tawakkalna: z.boolean().default(false),
  }),
  session: z
    .object({
      receiverName: z.string().optional(),
      sessionDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
        .optional(),
      strengths: z.string().optional(),
      weaknesses: z.string().optional(),
      gaps: z.string().optional(),
    })
    .optional(),
});

export const SendReportDto = z.object({
  channel: z.enum(['email', 'sms', 'whatsapp']),
  destination: z.string().min(3, 'Destination (email or phone) is required'),
});

export type CreateSessionReportInput = z.infer<typeof CreateSessionReport>;
export type SendReportInput = z.infer<typeof SendReportDto>;
