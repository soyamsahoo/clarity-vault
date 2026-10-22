import { z } from 'zod';
import { employmentTypeSchema, universityTypeSchema } from './common';

export const bankPolicySchema = z.object({
  id: z.string(),
  bankId: z.string(),
  bankName: z.string(),
  bankCode: z.string(),
  bankLogoInitials: z.string(),
  bankAccentColor: z.string(),
  productName: z.string(),
  minCreditScore: z.number().int(),
  maxFoir: z.number(),
  minMonthlyIncome: z.number().int(),
  maxLoanAmount: z.number().int(),
  minTenureMonths: z.number().int(),
  maxTenureMonths: z.number().int(),
  baseRate: z.number(),
  maxRate: z.number(),
  requiresCoApplicant: z.boolean(),
  allowedEmploymentTypes: z.array(employmentTypeSchema),
  maxLtv: z.number(),
  processingFeePct: z.number(),
  collateralRequiredAbove: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.array(z.string()),
  updatedAt: z.string(),
});
export type BankPolicy = z.infer<typeof bankPolicySchema>;

export const updateBankPolicySchema = z.object({
  productName: z.string().min(2).max(120).optional(),
  minCreditScore: z.number().int().min(300).max(900).optional(),
  maxFoir: z.number().min(0.2).max(0.8).optional(),
  minMonthlyIncome: z.number().int().min(0).max(10_000_000).optional(),
  maxLoanAmount: z.number().int().min(100_000).max(100_000_000).optional(),
  minTenureMonths: z.number().int().min(12).max(240).optional(),
  maxTenureMonths: z.number().int().min(12).max(300).optional(),
  baseRate: z.number().min(4).max(24).optional(),
  maxRate: z.number().min(4).max(30).optional(),
  requiresCoApplicant: z.boolean().optional(),
  maxLtv: z.number().min(0.3).max(1).optional(),
  processingFeePct: z.number().min(0).max(5).optional(),
  collateralRequiredAbove: z.number().int().min(0).max(100_000_000).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.array(z.string().max(240)).max(6).optional(),
});
export type UpdateBankPolicyInput = z.infer<typeof updateBankPolicySchema>;

export const adminStatsSchema = z.object({
  universities: z.number().int(),
  programs: z.number().int(),
  bankPolicies: z.number().int(),
  activePolicies: z.number().int(),
  students: z.number().int(),
  verifiedFeeSlips: z.number().int(),
  pendingFeeSlips: z.number().int(),
  certificatesIssued: z.number().int(),
  preApprovalRuns: z.number().int(),
  averageAllInCost: z.number().int().nullable(),
  simulation: z.literal(true),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

export const adminUniversityRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  shortName: z.string(),
  type: universityTypeSchema,
  city: z.string(),
  state: z.string(),
  nirfRank: z.number().int().nullable(),
  verified: z.boolean(),
  programsCount: z.number().int(),
  costSchedulesCount: z.number().int(),
  feeSlipsCount: z.number().int(),
  updatedAt: z.string(),
});
export type AdminUniversityRow = z.infer<typeof adminUniversityRowSchema>;

export const upsertCostScheduleSchema = z.object({
  programId: z.string().min(1),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/),
  tuition: z.number().int().min(0),
  hostel: z.number().int().min(0),
  mess: z.number().int().min(0),
  oneTime: z.number().int().min(0),
  other: z.number().int().min(0),
  sourceLabel: z.string().max(120).default('Admin curated schedule'),
  sourceType: z.enum(['OFFICIAL', 'CURATED']).default('CURATED'),
  verified: z.boolean().default(false),
});
export type UpsertCostScheduleInput = z.infer<typeof upsertCostScheduleSchema>;

export const adminOverviewSchema = z.object({
  stats: adminStatsSchema,
  recentFeeSlips: z.array(
    z.object({
      id: z.string(),
      universityName: z.string(),
      submitterName: z.string(),
      total: z.number().int(),
      status: z.string(),
      submittedAt: z.string(),
    }),
  ),
  recentCertificates: z.array(
    z.object({
      id: z.string(),
      studentName: z.string(),
      universityName: z.string(),
      verificationCode: z.string(),
      issuedAt: z.string(),
    }),
  ),
  policies: z.array(bankPolicySchema),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
