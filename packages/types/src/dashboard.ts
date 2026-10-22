import { z } from 'zod';
import { authUserSchema } from './auth';
import { certificateSummarySchema } from './certificates';
import { feeSlipSummarySchema } from './fees';
import { bankOfferSchema } from './pre-approvals';
import { riskBandSchema } from './common';
import { allInCostSchema, outcomeOracleSchema, universitySummarySchema } from './universities';

export const dashboardSchema = z.object({
  user: authUserSchema,
  target: z
    .object({
      university: universitySummarySchema,
      program: z.object({
        id: z.string(),
        name: z.string(),
        degree: z.string(),
        durationMonths: z.number().int(),
      }),
      cost: allInCostSchema,
      outcome: outcomeOracleSchema.nullable(),
    })
    .nullable(),
  readiness: z.object({
    score: z.number().int(),
    label: z.string(),
    factors: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        detail: z.string(),
        weight: z.number(),
        complete: z.boolean(),
      }),
    ),
  }),
  actions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      cta: z.string(),
      route: z.string(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      complete: z.boolean(),
    }),
  ),
  certificate: certificateSummarySchema.nullable(),
  feeSlips: z.array(feeSlipSummarySchema),
  aa: z.object({
    linked: z.boolean(),
    monthlyIncome: z.number().int().nullable(),
    creditScore: z.number().int().nullable(),
    verifiedAt: z.string().nullable(),
  }),
  bestOffer: bankOfferSchema.nullable(),
  offerCount: z.number().int(),
  risk: z
    .object({
      id: z.string().nullable(),
      riskBand: riskBandSchema,
      resilienceScore: z.number(),
      probabilityOfDistress: z.number(),
      monthlySurplus: z.number().int(),
      generatedAt: z.string(),
    })
    .nullable(),
  stats: z.object({
    grandTotal: z.number().int().nullable(),
    loanRequired: z.number().int().nullable(),
    estimatedEmi: z.number().int().nullable(),
    medianSalary: z.number().int().nullable(),
    verifiedSlipCount: z.number().int(),
    certificateCount: z.number().int(),
  }),
  insight: z.string(),
  updatedAt: z.string(),
  simulation: z.literal(true),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
