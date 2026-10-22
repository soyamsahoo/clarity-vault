import { z } from 'zod';

export const SIMULATION_DISCLAIMER =
  'Simulation Mode: all university costs, fee slips, bank policies, credit data and placement outcomes shown here are realistic synthetic samples. Clarity Vault is not a lender, credit bureau, or Account Aggregator. No offer here is a binding credit commitment.';

export const simulationMetaSchema = z.object({
  simulation: z.literal(true),
  disclaimer: z.string(),
  integrations: z.object({
    accountAggregator: z.enum(['SIMULATED', 'LIVE']),
    universityCosts: z.enum(['SIMULATED', 'LIVE']),
    lenderQuotes: z.enum(['SIMULATED', 'LIVE']),
    kyc: z.enum(['SIMULATED', 'LIVE']),
    clerkAuth: z.enum(['SIMULATED_DEMO', 'CLERK']),
  }),
  version: z.string(),
  serverTime: z.string(),
});
export type SimulationMeta = z.infer<typeof simulationMetaSchema>;

export const userRoleSchema = z.enum(['STUDENT', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const kycStatusSchema = z.enum(['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED']);
export type KycStatus = z.infer<typeof kycStatusSchema>;

export const verificationStatusSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const universityTypeSchema = z.enum([
  'IIT',
  'NIT',
  'IIIT',
  'BITS',
  'GOVERNMENT',
  'PRIVATE',
  'DEEMED',
]);
export type UniversityType = z.infer<typeof universityTypeSchema>;

export const outcomeSourceTypeSchema = z.enum([
  'OFFICIAL',
  'GOVT_SURVEY',
  'ALUMNI_SURVEY',
  'CROWDSOURCED',
]);
export type OutcomeSourceType = z.infer<typeof outcomeSourceTypeSchema>;

export const consentStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'FAILED',
]);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const approvalStatusSchema = z.enum([
  'PRE_APPROVED',
  'CONDITIONAL',
  'DECLINED',
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const riskBandSchema = z.enum(['RESILIENT', 'MANAGEABLE', 'ELEVATED', 'CRITICAL']);
export type RiskBand = z.infer<typeof riskBandSchema>;

export const certificateStatusSchema = z.enum(['ACTIVE', 'REVOKED']);
export type CertificateStatus = z.infer<typeof certificateStatusSchema>;

export const feeSlipFileTypeSchema = z.enum(['PDF', 'IMAGE']);
export type FeeSlipFileType = z.infer<typeof feeSlipFileTypeSchema>;

export const employmentTypeSchema = z.enum([
  'SALARIED_PRIVATE',
  'SALARIED_GOVT',
  'SELF_EMPLOYED',
  'BUSINESS',
  'STUDENT',
  'NOT_EMPLOYED',
]);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const universityTypeLabels: Record<UniversityType, string> = {
  IIT: 'IIT',
  NIT: 'NIT',
  IIIT: 'IIIT',
  BITS: 'BITS',
  GOVERNMENT: 'Government',
  PRIVATE: 'Private',
  DEEMED: 'Deemed',
};

export const sourceTypeLabels: Record<OutcomeSourceType, string> = {
  OFFICIAL: 'Official placement report',
  GOVT_SURVEY: 'Government / NIRF survey',
  ALUMNI_SURVEY: 'Verified alumni survey',
  CROWDSOURCED: 'Crowdsourced student reports',
};

export const approvalStatusLabels: Record<ApprovalStatus, string> = {
  PRE_APPROVED: 'Pre-approved',
  CONDITIONAL: 'Conditional match',
  DECLINED: 'Not eligible yet',
};

export const riskBandLabels: Record<RiskBand, string> = {
  RESILIENT: 'Resilient',
  MANAGEABLE: 'Manageable',
  ELEVATED: 'Elevated',
  CRITICAL: 'Critical',
};
