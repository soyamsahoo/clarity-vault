import { z } from 'zod';
import { riskBandSchema } from './common';

export const riskSimulationRequestSchema = z.object({
  universityId: z.string().min(1),
  programId: z.string().min(1),
  loanAmount: z.number().int().min(50_000).max(15_000_000).optional(),
  annualRate: z.number().min(6).max(20).optional(),
  tenureMonths: z.number().int().min(24).max(240).optional(),
  expectedSalaryOverride: z.number().int().min(0).max(50_000_000).nullable().optional(),
  aiHiringShockPct: z.number().min(0).max(60).default(20),
  jobDelayMonths: z.number().int().min(0).max(24).default(0),
  rateHikeBps: z.number().int().min(0).max(500).default(0),
  livingCostPct: z.number().min(10).max(70).optional(),
  iterations: z.number().int().min(500).max(20_000).default(10_000),
  seed: z.number().int().min(1).max(2_147_483_647).optional(),
});
export type RiskSimulationRequest = z.infer<typeof riskSimulationRequestSchema>;

export const riskScenarioKeySchema = z.enum([
  'BASE',
  'AI_SHOCK',
  'QUIET_P25',
  'DELAYED_START',
  'RATE_HIKE',
  'COMBINED_STRESS',
]);
export type RiskScenarioKey = z.infer<typeof riskScenarioKeySchema>;

export const riskScenarioResultSchema = z.object({
  key: riskScenarioKeySchema,
  label: z.string(),
  description: z.string(),
  probabilityOfDistress: z.number(),
  probabilityEmiOver50: z.number(),
  medianMonthsToPayoff: z.number().int(),
  medianTotalInterest: z.number().int(),
  medianMonthlySurplusY1: z.number().int(),
  monthlyEmi: z.number().int(),
  riskBand: riskBandSchema,
  verdict: z.string(),
});
export type RiskScenarioResult = z.infer<typeof riskScenarioResultSchema>;

export const riskInputsSchema = z.object({
  principal: z.number().int(),
  annualRate: z.number(),
  tenureMonths: z.number().int(),
  moratoriumMonths: z.number().int(),
  courseDurationMonths: z.number().int(),
  expectedMonthlySalary: z.number().int(),
  salaryGrowthPct: z.number(),
  livingCostPct: z.number(),
  existingEmi: z.number().int(),
  placementProbability: z.number(),
  aiHiringShockPct: z.number(),
  jobDelayMonths: z.number().int(),
  rateHikeBps: z.number().int(),
  iterations: z.number().int(),
  seed: z.number().int(),
});
export type RiskInputs = z.infer<typeof riskInputsSchema>;

export const riskResultSchema = z.object({
  id: z.string().nullable(),
  generatedAt: z.string(),
  universityId: z.string(),
  universityName: z.string(),
  programId: z.string(),
  programName: z.string(),
  inputs: riskInputsSchema,
  metrics: z.object({
    probabilityOfDistress: z.number(),
    probabilityEmiOver50: z.number(),
    medianMonthsToPayoff: z.number().int(),
    p90MonthsToPayoff: z.number().int(),
    medianTotalInterest: z.number().int(),
    p90TotalInterest: z.number().int(),
    medianEmergencyRunwayMonths: z.number(),
    p10EmergencyRunwayMonths: z.number(),
    firstYearSalary: z.object({
      p10: z.number().int(),
      p50: z.number().int(),
      p90: z.number().int(),
    }),
    monthlyEmi: z.number().int(),
    dtiAtP50: z.number(),
    riskBand: riskBandSchema,
    resilienceScore: z.number(),
    verdict: z.string(),
  }),
  scenarios: z.array(riskScenarioResultSchema),
  cashflow: z.array(
    z.object({
      month: z.number().int(),
      p10: z.number().int(),
      p50: z.number().int(),
      p90: z.number().int(),
    }),
  ),
  dtiDistribution: z.array(
    z.object({
      bucket: z.string(),
      min: z.number(),
      max: z.number(),
      count: z.number().int(),
      pct: z.number(),
    }),
  ),
  stressMap: z.array(
    z.object({
      salary: z.number().int(),
      loan: z.number().int(),
      distressProbability: z.number(),
      riskBand: riskBandSchema,
    }),
  ),
  narrative: z.array(z.string()),
  sampling: z.object({
    iterations: z.number().int(),
    seed: z.number().int(),
    deterministic: z.literal(true),
    method: z.string(),
  }),
  simulation: z.literal(true),
  disclaimer: z.string(),
});
export type RiskResult = z.infer<typeof riskResultSchema>;

export const stressMapRequestSchema = z.object({
  universityId: z.string().min(1),
  programId: z.string().min(1),
  baseLoanAmount: z.number().int().min(50_000).max(15_000_000).optional(),
  baseMonthlySalary: z.number().int().min(0).max(2_000_000).optional(),
  iterations: z.number().int().min(200).max(4000).default(1200),
  seed: z.number().int().min(1).max(2_147_483_647).optional(),
});
export type StressMapRequest = z.infer<typeof stressMapRequestSchema>;

export const stressMapResponseSchema = z.object({
  salaryAxis: z.array(z.number().int()),
  loanAxis: z.array(z.number().int()),
  cells: z.array(
    z.object({
      salary: z.number().int(),
      loan: z.number().int(),
      distressProbability: z.number(),
      riskBand: riskBandSchema,
    }),
  ),
  safeThreshold: z.number(),
  note: z.string(),
  simulation: z.literal(true),
});
export type StressMapResponse = z.infer<typeof stressMapResponseSchema>;
