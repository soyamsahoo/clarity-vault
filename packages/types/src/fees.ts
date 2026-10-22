import { z } from 'zod';
import { feeSlipFileTypeSchema, kycStatusSchema, verificationStatusSchema } from './common';

export const createFeeSlipSchema = z.object({
  universityId: z.string().min(1),
  programId: z.string().min(1).optional(),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Use a format like 2025-26'),
  tuition: z.coerce.number().int().min(0).max(10_000_000),
  hostel: z.coerce.number().int().min(0).max(5_000_000).default(0),
  mess: z.coerce.number().int().min(0).max(2_000_000).default(0),
  oneTime: z.coerce.number().int().min(0).max(5_000_000).default(0),
  other: z.coerce.number().int().min(0).max(2_000_000).default(0),
  receiptNumber: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
  declaration: z
    .union([z.boolean(), z.literal('true'), z.literal('1')])
    .transform((value) => value === true || value === 'true' || value === '1')
    .refine((value) => value, 'You must confirm this is your genuine fee receipt'),
});
export type CreateFeeSlipInput = z.infer<typeof createFeeSlipSchema>;

export const feeSlipSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  submitterName: z.string(),
  universityId: z.string(),
  universityName: z.string(),
  universityShortName: z.string(),
  programId: z.string().nullable(),
  programName: z.string().nullable(),
  academicYear: z.string(),
  tuition: z.number().int(),
  hostel: z.number().int(),
  mess: z.number().int(),
  oneTime: z.number().int(),
  other: z.number().int(),
  total: z.number().int(),
  fileUrl: z.string(),
  fileName: z.string(),
  fileType: feeSlipFileTypeSchema,
  status: verificationStatusSchema,
  kycStatus: kycStatusSchema,
  receiptNumber: z.string().nullable(),
  notes: z.string().nullable(),
  verificationNotes: z.string().nullable(),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  simulation: z.literal(true),
});
export type FeeSlipSummary = z.infer<typeof feeSlipSummarySchema>;

export const reviewFeeSlipSchema = z.object({
  action: z.enum(['VERIFY', 'REJECT', 'START_REVIEW']),
  notes: z.string().max(500).optional(),
});
export type ReviewFeeSlipInput = z.infer<typeof reviewFeeSlipSchema>;

export const feeSlipStatsSchema = z.object({
  total: z.number().int(),
  pending: z.number().int(),
  verified: z.number().int(),
  rejected: z.number().int(),
  mine: z.number().int(),
  verifiedThisMonth: z.number().int(),
});
export type FeeSlipStats = z.infer<typeof feeSlipStatsSchema>;
