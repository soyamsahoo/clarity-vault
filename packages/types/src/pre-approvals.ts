import { z } from 'zod';
import { approvalStatusSchema, employmentTypeSchema } from './common';

export const preApprovalRequestSchema = z.object({
  universityId: z.string().min(1),
  programId: z.string().min(1),
  requestedAmount: z.number().int().min(50_000).max(15_000_000).optional(),
  coApplicant: z.boolean().default(false),
  collateralValue: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
export type PreApprovalRequest = z.infer<typeof preApprovalRequestSchema>;

export const bankOfferSchema = z.object({
  id: z.string(),
  bankId: z.string(),
  bankName: z.string(),
  bankCode: z.string(),
  productName: z.string(),
  logoInitials: z.string(),
  accentColor: z.string(),
  status: approvalStatusSchema,
  approvedAmount: z.number().int(),
  interestRate: z.number(),
  tenureMonths: z.number().int(),
  emi: z.number().int(),
  totalInterest: z.number().int(),
  processingFee: z.number().int(),
  confidence: z.number(),
  reasons: z.array(z.string()),
  conditions: z.array(z.string()),
  collateralRequired: z.boolean(),
  coApplicantRequired: z.boolean(),
  foir: z.number(),
  notes: z.array(z.string()),
  expiresAt: z.string().nullable(),
});
export type BankOffer = z.infer<typeof bankOfferSchema>;

export const underwritingProfileSchema = z.object({
  creditScore: z.number().int(),
  monthlyIncome: z.number().int(),
  monthlyExpenses: z.number().int(),
  existingEmi: z.number().int(),
  employmentType: employmentTypeSchema,
  employmentStabilityMonths: z.number().int(),
  coApplicant: z.boolean(),
  collateralValue: z.number().int().nullable(),
  dataQuality: z.number(),
});
export type UnderwritingProfile = z.infer<typeof underwritingProfileSchema>;

export const preApprovalRunSchema = z.object({
  runId: z.string(),
  generatedAt: z.string(),
  expiresAt: z.string(),
  requestedAmount: z.number().int(),
  allInCost: z.number().int(),
  profile: underwritingProfileSchema,
  offers: z.array(bankOfferSchema),
  bestOfferId: z.string().nullable(),
  preApprovedCount: z.number().int(),
  conditionalCount: z.number().int(),
  declinedCount: z.number().int(),
  summary: z.string(),
  simulation: z.literal(true),
  disclaimer: z.string(),
});
export type PreApprovalRun = z.infer<typeof preApprovalRunSchema>;
