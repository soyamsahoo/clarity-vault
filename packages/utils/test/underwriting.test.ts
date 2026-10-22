import { describe, expect, it } from 'vitest';
import {
  evaluatePolicies,
  evaluatePolicy,
  type BankPolicyMatrix,
  type UnderwritingApplicant,
} from '../src/underwriting';
import { triangulateOutcomes } from '../src/costs';

const policy: BankPolicyMatrix = {
  id: 'policy-1',
  bankId: 'bank-1',
  bankName: 'State Bank of India',
  bankCode: 'SBI',
  bankLogoInitials: 'SBI',
  bankAccentColor: '#1E40AF',
  productName: 'SBI Scholar Loan',
  minCreditScore: 700,
  maxFoir: 0.5,
  minMonthlyIncome: 25_000,
  maxLoanAmount: 5_000_000,
  minTenureMonths: 60,
  maxTenureMonths: 180,
  baseRate: 8.5,
  maxRate: 11,
  requiresCoApplicant: true,
  allowedEmploymentTypes: ['SALARIED_PRIVATE', 'SALARIED_GOVT', 'SELF_EMPLOYED'],
  maxLtv: 0.9,
  processingFeePct: 0.5,
  collateralRequiredAbove: 4_000_000,
  active: true,
  notes: ['0.5% processing fee, waived for top-ranked institutes.'],
};

const applicant: UnderwritingApplicant = {
  creditScore: 780,
  monthlyIncome: 120_000,
  monthlyExpenses: 42_000,
  existingEmi: 4_000,
  employmentType: 'SALARIED_PRIVATE',
  employmentStabilityMonths: 30,
  coApplicant: true,
  collateralValue: null,
  dataQuality: 0.9,
};

describe('underwriting translator', () => {
  it('pre-approves a strong profile with a sensible EMI', () => {
    const decision = evaluatePolicy({
      applicant,
      policy,
      requestedAmount: 1_500_000,
      costOfStudy: 1_800_000,
      courseDurationMonths: 48,
      moratoriumMonths: 54,
    });
    expect(decision.status).toBe('PRE_APPROVED');
    expect(decision.approvedAmount).toBe(1_500_000);
    expect(decision.interestRate).toBe(8.75);
    expect(decision.emi).toBeGreaterThan(0);
    expect(decision.confidence).toBeGreaterThan(0.6);
  });

  it('makes a missing co-applicant a condition, not a silent pass', () => {
    const decision = evaluatePolicy({
      applicant: { ...applicant, coApplicant: false },
      policy,
      requestedAmount: 1_500_000,
      costOfStudy: 1_800_000,
      courseDurationMonths: 48,
      moratoriumMonths: 54,
    });
    expect(decision.status).toBe('CONDITIONAL');
    expect(decision.conditions.join(' ')).toMatch(/co-applicant/i);
  });

  it('declines below the credit floor', () => {
    const decision = evaluatePolicy({
      applicant: { ...applicant, creditScore: 640 },
      policy,
      requestedAmount: 1_500_000,
      costOfStudy: 1_800_000,
      courseDurationMonths: 48,
      moratoriumMonths: 54,
    });
    expect(decision.status).toBe('DECLINED');
    expect(decision.approvedAmount).toBe(0);
  });

  it('caps the loan at 90% LTV', () => {
    const decision = evaluatePolicy({
      applicant,
      policy,
      requestedAmount: 5_000_000,
      costOfStudy: 2_000_000,
      courseDurationMonths: 48,
      moratoriumMonths: 54,
    });
    expect(decision.approvedAmount).toBeLessThanOrEqual(1_800_000);
  });

  it('sorts pre-approved offers above conditional and declined offers', () => {
    const offers = evaluatePolicies(applicant, [policy], {
      requestedAmount: 1_500_000,
      costOfStudy: 1_800_000,
      courseDurationMonths: 48,
      moratoriumMonths: 54,
    });
    expect(offers[0]?.status).toBe('PRE_APPROVED');
  });
});

describe('outcome triangulation', () => {
  const official = {
    id: '1',
    type: 'OFFICIAL' as const,
    label: 'Official',
    year: 2025,
    sampleSize: 900,
    placementRate: 0.95,
    medianSalary: 2_200_000,
    p25Salary: 1_500_000,
    p75Salary: 3_000_000,
    confidence: 0.9,
    notes: null,
  };
  const crowd = {
    ...official,
    id: '2',
    type: 'CROWDSOURCED' as const,
    label: 'Crowd',
    sampleSize: 120,
    placementRate: 0.82,
    medianSalary: 1_400_000,
    p25Salary: 1_000_000,
    p75Salary: 2_000_000,
    confidence: 0.7,
  };

  it('weights official data more but lets conflicting crowd data lower confidence', () => {
    const oneSource = triangulateOutcomes([official]);
    const twoSources = triangulateOutcomes([official, crowd]);
    expect(twoSources.medianSalary).toBeLessThan(official.medianSalary);
    expect(twoSources.confidence).toBeLessThan(0.94);
    expect(twoSources.totalSampleSize).toBe(1020);
    expect(oneSource.confidence).toBeLessThanOrEqual(0.55);
  });
});
