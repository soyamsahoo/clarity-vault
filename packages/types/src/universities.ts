import { z } from 'zod';
import { outcomeSourceTypeSchema, universityTypeSchema } from './common';

export const programSummarySchema = z.object({
  id: z.string(),
  universityId: z.string(),
  name: z.string(),
  degree: z.string(),
  discipline: z.string(),
  durationMonths: z.number().int(),
  seats: z.number().int(),
  stem: z.boolean(),
  medianSalary: z.number().int().nullable(),
  allInCost: z.number().int().nullable(),
});
export type ProgramSummary = z.infer<typeof programSummarySchema>;

export const allInCostSchema = z.object({
  universityId: z.string(),
  universityName: z.string(),
  programId: z.string(),
  programName: z.string(),
  degree: z.string(),
  durationMonths: z.number().int(),
  durationYears: z.number(),
  currency: z.literal('INR'),
  academicYears: z.array(
    z.object({
      academicYear: z.string(),
      label: z.string(),
      tuition: z.number().int(),
      hostel: z.number().int(),
      mess: z.number().int(),
      oneTime: z.number().int(),
      other: z.number().int(),
      total: z.number().int(),
    }),
  ),
  breakdown: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      amount: z.number().int(),
      perYear: z.boolean(),
      note: z.string().nullable(),
    }),
  ),
  tuitionTotal: z.number().int(),
  livingTotal: z.number().int(),
  oneTimeTotal: z.number().int(),
  otherTotal: z.number().int(),
  grandTotal: z.number().int(),
  averageAnnualCost: z.number().int(),
  annualEscalationPct: z.number(),
  financingEstimate: z.object({
    principal: z.number().int(),
    annualRate: z.number(),
    tenureMonths: z.number().int(),
    monthlyEmi: z.number().int(),
    totalInterest: z.number().int(),
    totalRepayment: z.number().int(),
    moratoriumMonths: z.number().int(),
  }),
  confidence: z.object({
    score: z.number(),
    label: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    verifiedScheduleCount: z.number().int(),
    verifiedFeeSlipCount: z.number().int(),
    feeSlipVariancePct: z.number().nullable(),
    reasons: z.array(z.string()),
  }),
  sources: z.array(
    z.object({
      label: z.string(),
      type: z.enum(['OFFICIAL_SCHEDULE', 'CROWDSOURCED_SLIP', 'INSTITUTION_WEBSITE']),
      verified: z.boolean(),
      records: z.number().int(),
      lastUpdated: z.string().nullable(),
    }),
  ),
  lastUpdated: z.string(),
});
export type AllInCost = z.infer<typeof allInCostSchema>;

export const outcomeSourceSchema = z.object({
  id: z.string(),
  type: outcomeSourceTypeSchema,
  label: z.string(),
  year: z.number().int(),
  sampleSize: z.number().int(),
  placementRate: z.number(),
  medianSalary: z.number().int(),
  p25Salary: z.number().int(),
  p75Salary: z.number().int(),
  confidence: z.number(),
  notes: z.string().nullable(),
});
export type OutcomeSource = z.infer<typeof outcomeSourceSchema>;

export const outcomeOracleSchema = z.object({
  universityId: z.string(),
  programId: z.string(),
  programName: z.string(),
  employmentRate: z.number(),
  medianSalary: z.number().int(),
  p25Salary: z.number().int(),
  p75Salary: z.number().int(),
  salaryGrowthPct: z.number(),
  topRecruiters: z.array(z.string()),
  aiExposureIndex: z.number(),
  aiRiskLabel: z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']),
  confidence: z.number(),
  totalSampleSize: z.number().int(),
  sources: z.array(outcomeSourceSchema),
  methodology: z.string(),
  lastUpdated: z.string(),
});
export type OutcomeOracle = z.infer<typeof outcomeOracleSchema>;

export const feeSlipPulseSchema = z.object({
  verifiedCount: z.number().int(),
  pendingCount: z.number().int(),
  averageTotal: z.number().int().nullable(),
  variancePct: z.number().nullable(),
  latestAcademicYear: z.string().nullable(),
  lastVerifiedAt: z.string().nullable(),
});
export type FeeSlipPulse = z.infer<typeof feeSlipPulseSchema>;

export const universitySummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  shortName: z.string(),
  type: universityTypeSchema,
  city: z.string(),
  state: z.string(),
  nirfRank: z.number().int().nullable(),
  established: z.number().int(),
  logoInitials: z.string(),
  accentColor: z.string(),
  verified: z.boolean(),
  programsCount: z.number().int(),
  stemProgramsCount: z.number().int(),
  allInCostFrom: z.number().int().nullable(),
  medianSalary: z.number().int().nullable(),
  placementRate: z.number().nullable(),
  outcomeConfidence: z.number().nullable(),
  topProgram: z
    .object({
      id: z.string(),
      name: z.string(),
      degree: z.string(),
      allInCost: z.number().int().nullable(),
      medianSalary: z.number().int().nullable(),
    })
    .nullable(),
});
export type UniversitySummary = z.infer<typeof universitySummarySchema>;

export const universityDetailSchema = universitySummarySchema.extend({
  description: z.string(),
  website: z.string(),
  address: z.string(),
  accreditation: z.string(),
  programs: z.array(programSummarySchema),
  feeSlipPulse: feeSlipPulseSchema,
  outcomeOverview: outcomeOracleSchema.nullable(),
  simulation: z.literal(true),
});
export type UniversityDetail = z.infer<typeof universityDetailSchema>;

export const universityListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: universityTypeSchema.optional(),
  state: z.string().max(80).optional(),
  sort: z.enum(['recommended', 'cost_asc', 'cost_desc', 'salary_desc', 'roi_desc']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type UniversityListQuery = z.infer<typeof universityListQuerySchema>;

export const universityListResponseSchema = z.object({
  items: z.array(universitySummarySchema),
  total: z.number().int(),
  states: z.array(z.string()),
  types: z.array(universityTypeSchema),
  simulation: z.literal(true),
});
export type UniversityListResponse = z.infer<typeof universityListResponseSchema>;

export const createUniversitySchema = z.object({
  name: z.string().min(3).max(160),
  shortName: z.string().min(2).max(20),
  slug: z.string().min(3).max(120).regex(/^[a-z0-9-]+$/),
  type: universityTypeSchema,
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  nirfRank: z.number().int().min(1).max(1000).nullable().optional(),
  established: z.number().int().min(1800).max(2100),
  website: z.string().url(),
  description: z.string().min(20).max(2000),
  accreditation: z.string().max(200).default('UGC recognised'),
  logoInitials: z.string().min(1).max(4),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  verified: z.boolean().default(false),
});
export type CreateUniversityInput = z.infer<typeof createUniversitySchema>;

export const updateUniversitySchema = createUniversitySchema.partial();
export type UpdateUniversityInput = z.infer<typeof updateUniversitySchema>;
