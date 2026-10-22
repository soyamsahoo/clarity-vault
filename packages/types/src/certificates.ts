import { z } from 'zod';
import { certificateStatusSchema } from './common';

export const createCertificateSchema = z.object({
  universityId: z.string().min(1),
  programId: z.string().min(1),
});
export type CreateCertificateInput = z.infer<typeof createCertificateSchema>;

export const certificateSnapshotSchema = z.object({
  universityName: z.string(),
  programName: z.string(),
  degree: z.string(),
  durationMonths: z.number().int(),
  academicYears: z.array(
    z.object({
      academicYear: z.string(),
      tuition: z.number().int(),
      hostel: z.number().int(),
      mess: z.number().int(),
      oneTime: z.number().int(),
      other: z.number().int(),
      total: z.number().int(),
    }),
  ),
  grandTotal: z.number().int(),
  tuitionTotal: z.number().int(),
  livingTotal: z.number().int(),
  confidenceScore: z.number(),
  confidenceLabel: z.string(),
  verifiedFeeSlipCount: z.number().int(),
  verifiedScheduleCount: z.number().int(),
  medianSalary: z.number().int().nullable(),
  placementRate: z.number().nullable(),
  financingEstimate: z.object({
    annualRate: z.number(),
    tenureMonths: z.number().int(),
    monthlyEmi: z.number().int(),
    totalInterest: z.number().int(),
  }),
});
export type CertificateSnapshot = z.infer<typeof certificateSnapshotSchema>;

export const certificateSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  studentName: z.string(),
  universityId: z.string(),
  programId: z.string(),
  universityName: z.string(),
  programName: z.string(),
  verificationCode: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  status: certificateStatusSchema,
  grandTotal: z.number().int(),
  confidenceScore: z.number(),
  downloadUrl: z.string(),
  verifyUrl: z.string(),
  snapshot: certificateSnapshotSchema,
  simulation: z.literal(true),
});
export type CertificateSummary = z.infer<typeof certificateSummarySchema>;

export const certificateVerificationSchema = z.object({
  valid: z.boolean(),
  verificationCode: z.string(),
  studentName: z.string().nullable(),
  universityName: z.string().nullable(),
  programName: z.string().nullable(),
  grandTotal: z.number().int().nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  status: certificateStatusSchema.nullable(),
  message: z.string(),
  simulation: z.literal(true),
});
export type CertificateVerification = z.infer<typeof certificateVerificationSchema>;
