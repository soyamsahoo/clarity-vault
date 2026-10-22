import { z } from 'zod';
import { consentStatusSchema, employmentTypeSchema } from './common';

export const aaPurposeSchema = z.enum([
  'EDUCATION_LOAN_UNDERWRITING',
  'PRE_APPROVAL_MATCHING',
  'FINANCIAL_HEALTH_CHECK',
]);
export type AaPurpose = z.infer<typeof aaPurposeSchema>;

export const fiTypeSchema = z.enum(['BANK_SAVINGS', 'SALARY_ACCOUNT', 'TERM_DEPOSIT']);
export type FiType = z.infer<typeof fiTypeSchema>;

export const createConsentSchema = z.object({
  purpose: aaPurposeSchema.default('EDUCATION_LOAN_UNDERWRITING'),
  durationMonths: z.number().int().min(1).max(12).default(3),
  fiTypes: z.array(fiTypeSchema).min(1, 'Select at least one account type'),
  dataRangeMonths: z.number().int().min(1).max(24).default(6),
});
export type CreateConsentInput = z.infer<typeof createConsentSchema>;

export const approveConsentSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
  selectedAccountIds: z.array(z.string()).min(1, 'Choose at least one account'),
  coApplicant: z.boolean().default(false),
});
export type ApproveConsentInput = z.infer<typeof approveConsentSchema>;

export const aaAccountSchema = z.object({
  id: z.string(),
  bankName: z.string(),
  accountType: z.string(),
  maskedNumber: z.string(),
  balance: z.number().int(),
  salaryCredited: z.boolean(),
});
export type AaAccount = z.infer<typeof aaAccountSchema>;

export const consentSummarySchema = z.object({
  id: z.string(),
  consentHandle: z.string(),
  status: consentStatusSchema,
  purpose: aaPurposeSchema,
  durationMonths: z.number().int(),
  dataRangeMonths: z.number().int(),
  fiTypes: z.array(fiTypeSchema),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  lastFetchedAt: z.string().nullable(),
  accounts: z.array(aaAccountSchema),
  simulationHint: z.string(),
  simulation: z.literal(true),
});
export type ConsentSummary = z.infer<typeof consentSummarySchema>;

export const financialProfileSchema = z.object({
  id: z.string(),
  consentId: z.string(),
  monthlyIncome: z.number().int(),
  monthlyExpenses: z.number().int(),
  existingEmi: z.number().int(),
  creditScore: z.number().int(),
  employmentType: employmentTypeSchema,
  employer: z.string().nullable(),
  bankName: z.string(),
  accountMasked: z.string(),
  averageBalance: z.number().int(),
  salaryCredits: z.number().int(),
  dataQuality: z.number(),
  verifiedAt: z.string(),
  incomeSources: z.array(
    z.object({ label: z.string(), monthlyAmount: z.number().int(), months: z.number().int() }),
  ),
  monthlySeries: z.array(
    z.object({ month: z.string(), salary: z.number().int(), spend: z.number().int() }),
  ),
  flags: z.array(z.string()),
  simulation: z.literal(true),
});
export type FinancialProfile = z.infer<typeof financialProfileSchema>;

export const aaStatusSchema = z.object({
  linked: z.boolean(),
  consent: consentSummarySchema.nullable(),
  profile: financialProfileSchema.nullable(),
  availableAccounts: z.array(aaAccountSchema),
  simulation: z.literal(true),
});
export type AaStatus = z.infer<typeof aaStatusSchema>;
