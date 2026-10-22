import type { ApprovalStatus, EmploymentType } from '@clarity/types';
import {
  capitaliseMoratoriumInterest,
  clamp,
  computeAffordablePrincipal,
  computeEmi,
  formatInrCompact,
} from './money';

export interface BankPolicyMatrix {
  id: string;
  bankId: string;
  bankName: string;
  bankCode: string;
  bankLogoInitials: string;
  bankAccentColor: string;
  productName: string;
  minCreditScore: number;
  maxFoir: number;
  minMonthlyIncome: number;
  maxLoanAmount: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  baseRate: number;
  maxRate: number;
  requiresCoApplicant: boolean;
  allowedEmploymentTypes: EmploymentType[];
  maxLtv: number;
  processingFeePct: number;
  collateralRequiredAbove: number | null;
  active: boolean;
  notes: string[];
}

export interface UnderwritingApplicant {
  creditScore: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  existingEmi: number;
  employmentType: EmploymentType;
  employmentStabilityMonths: number;
  coApplicant: boolean;
  collateralValue: number | null;
  dataQuality: number;
}

export interface UnderwritingRequest {
  applicant: UnderwritingApplicant;
  policy: BankPolicyMatrix;
  requestedAmount: number;
  costOfStudy: number;
  courseDurationMonths: number;
  moratoriumMonths: number;
  requestedTenureMonths?: number;
}

export interface OfferDecision {
  policyId: string;
  status: ApprovalStatus;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
  emi: number;
  totalInterest: number;
  processingFee: number;
  confidence: number;
  reasons: string[];
  conditions: string[];
  collateralRequired: boolean;
  coApplicantRequired: boolean;
  foir: number;
  notes: string[];
}

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  SALARIED_PRIVATE: 'salaried (private)',
  SALARIED_GOVT: 'salaried (government)',
  SELF_EMPLOYED: 'self-employed',
  BUSINESS: 'business owner',
  STUDENT: 'student',
  NOT_EMPLOYED: 'not employed',
};

function rateForScore(policy: BankPolicyMatrix, score: number): number {
  const spread =
    score >= 800
      ? 0
      : score >= 775
        ? 0.25
        : score >= 750
          ? 0.5
          : score >= 725
            ? 0.9
            : score >= 700
              ? 1.3
              : score >= 675
                ? 1.8
                : 2.5;
  return Number(clamp(policy.baseRate + spread, policy.baseRate, policy.maxRate).toFixed(2));
}

export function evaluatePolicy(request: UnderwritingRequest): OfferDecision {
  const { applicant, policy, requestedAmount, costOfStudy, moratoriumMonths } = request;
  const reasons: string[] = [];
  const conditions: string[] = [];
  const blocking: string[] = [];
  const tenure = clamp(
    request.requestedTenureMonths ?? policy.maxTenureMonths,
    policy.minTenureMonths,
    policy.maxTenureMonths,
  );
  const rate = rateForScore(policy, applicant.creditScore);

  if (!policy.active) blocking.push('This lender product is paused for new applications.');
  if (applicant.creditScore < policy.minCreditScore) {
    blocking.push(
      `Credit score ${applicant.creditScore} is below this product's floor of ${policy.minCreditScore}.`,
    );
  }
  if (applicant.monthlyIncome < policy.minMonthlyIncome) {
    blocking.push(
      `Verified monthly income ${formatInrCompact(
        applicant.monthlyIncome,
      )} is below the ${formatInrCompact(policy.minMonthlyIncome)} policy floor.`,
    );
  }
  if (!policy.allowedEmploymentTypes.includes(applicant.employmentType)) {
    blocking.push(
      `${EMPLOYMENT_LABELS[applicant.employmentType]} applicants are not eligible for this product.`,
    );
  }
  if (requestedAmount > policy.maxLoanAmount) {
    conditions.push(`Sanction capped at the product ceiling of ${formatInrCompact(policy.maxLoanAmount)}.`);
  }
  if (applicant.employmentStabilityMonths < 6 && applicant.employmentType !== 'STUDENT') {
    conditions.push('Six months of income stability or a co-applicant income proof is required.');
  }
  if (applicant.dataQuality < 0.7) {
    conditions.push('Bank statement analysis flagged thin data; manual review required.');
  }

  let approvedAmount = Math.min(
    requestedAmount,
    policy.maxLoanAmount,
    Math.floor(costOfStudy * policy.maxLtv),
  );

  if (approvedAmount < requestedAmount * 0.55 && approvedAmount > 0) {
    conditions.push(
      `Maximum funding is ${Math.round(policy.maxLtv * 100)}% of the verified cost of study.`,
    );
  }

  const collateralRequired =
    policy.collateralRequiredAbove !== null && approvedAmount > policy.collateralRequiredAbove;
  if (collateralRequired) {
    if (applicant.collateralValue && applicant.collateralValue > 0) {
      const collateralCover = applicant.collateralValue / approvedAmount;
      if (collateralCover >= 1) {
        reasons.push('Declared collateral covers the secured-loan requirement.');
      } else {
        conditions.push(
          `Collateral cover is ${Math.round(collateralCover * 100)}% of the loan; top-up security needed.`,
        );
      }
    } else {
      conditions.push(
        `Secured loan above ${formatInrCompact(
          policy.collateralRequiredAbove ?? 0,
        )}; collateral will be required at sanction.`,
      );
    }
  }

  if (policy.requiresCoApplicant && !applicant.coApplicant) {
    conditions.push('A co-applicant (parent/guardian) is required for this product.');
  }

  let capitalised = capitaliseMoratoriumInterest(approvedAmount, rate, moratoriumMonths);
  let emi = computeEmi(capitalised, rate, tenure);
  let foir = applicant.monthlyIncome > 0 ? (emi + applicant.existingEmi) / applicant.monthlyIncome : 1;

  if (blocking.length === 0 && foir > policy.maxFoir) {
    const availableEmi = applicant.monthlyIncome * policy.maxFoir - applicant.existingEmi;
    const affordableCapitalised = computeAffordablePrincipal(availableEmi, rate, tenure);
    const affordablePrincipal = Math.floor(
      affordableCapitalised / (1 + (rate * moratoriumMonths) / 12 / 100),
    );
    if (affordablePrincipal >= Math.min(requestedAmount * 0.55, costOfStudy * 0.5)) {
      approvedAmount = affordablePrincipal;
      conditions.push(
        `Sanction may be capped near ${formatInrCompact(
          affordableAmount(affordablePrincipal),
        )} to keep FOIR at or below ${Math.round(policy.maxFoir * 100)}%.`,
      );
      capitalised = capitaliseMoratoriumInterest(approvedAmount, rate, moratoriumMonths);
      emi = computeEmi(capitalised, rate, tenure);
      foir =
        applicant.monthlyIncome > 0
          ? (emi + applicant.existingEmi) / applicant.monthlyIncome
          : 1;
    } else {
      blocking.push(
        `Required EMI needs ${Math.round(foir * 100)}% of verified income, above the ${Math.round(
          policy.maxFoir * 100,
        )}% FOIR cap.`,
      );
    }
  }

  if (blocking.length === 0) {
    if (foir <= policy.maxFoir * 0.8) {
      reasons.push(
        `FOIR of ${Math.round(foir * 100)}% sits comfortably inside the ${Math.round(
          policy.maxFoir * 100,
        )}% ceiling.`,
      );
    } else {
      reasons.push(
        `FOIR of ${Math.round(foir * 100)}% is close to the ${Math.round(
          policy.maxFoir * 100,
        )}% limit — avoid adding new credit.`,
      );
    }
    if (applicant.creditScore >= policy.minCreditScore + 25) {
      reasons.push(
        `Credit score ${applicant.creditScore} clears the ${policy.minCreditScore} floor.`,
      );
    }
    if (!collateralRequired) {
      reasons.push('Unsecured education loan within this lender\'s collateral-free band.');
    }
    if (applicant.dataQuality >= 0.8) {
      reasons.push('Account Aggregator data quality is strong (salary credits + 6-month trend).');
    }
  }

  const status: ApprovalStatus =
    blocking.length > 0 || approvedAmount <= 0
      ? 'DECLINED'
      : conditions.length > 0
        ? 'CONDITIONAL'
        : 'PRE_APPROVED';

  if (status === 'DECLINED') {
    approvedAmount = 0;
    emi = 0;
    capitalised = 0;
    foir = applicant.monthlyIncome > 0 ? applicant.existingEmi / applicant.monthlyIncome : 0;
  }

  const creditHeadroom = clamp(
    (applicant.creditScore - policy.minCreditScore) / 150,
    0,
    1,
  );
  const foirHeadroom = clamp((policy.maxFoir - foir) / policy.maxFoir, 0, 1);
  const baseConfidence =
    0.45 +
    creditHeadroom * 0.22 +
    foirHeadroom * 0.2 +
    clamp(applicant.dataQuality, 0, 1) * 0.1 +
    (policy.requiresCoApplicant && applicant.coApplicant ? 0.03 : 0);
  const confidence =
    status === 'DECLINED'
      ? Number(clamp(0.1 + foirHeadroom * 0.1, 0.05, 0.3).toFixed(2))
      : Number(clamp(baseConfidence - conditions.length * 0.035, 0.35, 0.97).toFixed(2));

  if (status === 'DECLINED') {
    reasons.length = 0;
    reasons.push(...blocking);
  }

  return {
    policyId: policy.id,
    status,
    approvedAmount,
    interestRate: rate,
    tenureMonths: tenure,
    emi: status === 'DECLINED' ? 0 : emi,
    totalInterest: status === 'DECLINED' ? 0 : Math.round(emi * tenure - capitalised),
    processingFee:
      status === 'DECLINED'
        ? 0
        : Math.round((approvedAmount * policy.processingFeePct) / 100 * 1.18),
    confidence,
    reasons,
    conditions: status === 'DECLINED' ? [] : [...new Set(conditions)],
    collateralRequired,
    coApplicantRequired: policy.requiresCoApplicant,
    foir: Number(foir.toFixed(3)),
    notes: policy.notes,
  };
}

function affordableAmount(value: number): number {
  return Math.max(0, value);
}

export interface OfferWithBank extends OfferDecision {
  bankName: string;
  bankCode: string;
  bankLogoInitials: string;
  bankAccentColor: string;
  productName: string;
}

export function evaluatePolicies(
  applicant: UnderwritingApplicant,
  policies: BankPolicyMatrix[],
  request: {
    requestedAmount: number;
    costOfStudy: number;
    courseDurationMonths: number;
    moratoriumMonths: number;
    requestedTenureMonths?: number;
  },
): OfferWithBank[] {
  const statusRank: Record<ApprovalStatus, number> = {
    PRE_APPROVED: 0,
    CONDITIONAL: 1,
    DECLINED: 2,
  };
  return policies
    .map((policy) => {
      const decision = evaluatePolicy({ ...request, applicant, policy });
      return {
        ...decision,
        bankName: policy.bankName,
        bankCode: policy.bankCode,
        bankLogoInitials: policy.bankLogoInitials,
        bankAccentColor: policy.bankAccentColor,
        productName: policy.productName,
      };
    })
    .sort((a, b) => {
      const statusDelta = statusRank[a.status] - statusRank[b.status];
      if (statusDelta !== 0) return statusDelta;
      if (a.status === 'DECLINED') return b.confidence - a.confidence;
      if (b.confidence - a.confidence > 0.05) return b.confidence - a.confidence;
      return a.interestRate - b.interestRate;
    });
}

export function findBestOffer(offers: OfferWithBank[]): OfferWithBank | null {
  return offers.find((offer) => offer.status === 'PRE_APPROVED') ?? offers.find((offer) => offer.status === 'CONDITIONAL') ?? null;
}

export function summariseOffers(offers: OfferWithBank[], requestedAmount: number): string {
  const preApproved = offers.filter((offer) => offer.status === 'PRE_APPROVED');
  const conditional = offers.filter((offer) => offer.status === 'CONDITIONAL');
  if (preApproved.length > 0) {
    const best = [...preApproved].sort((a, b) => a.interestRate - b.interestRate)[0];
    return `${preApproved.length} lender${preApproved.length > 1 ? 's' : ''} pre-approved up to ${formatInrCompact(
      requestedAmount,
    )}. Best indicative rate: ${best?.interestRate.toFixed(2)}% from ${best?.bankName}.`;
  }
  if (conditional.length > 0) {
    return `No clean pre-approvals yet. ${conditional.length} lender${
      conditional.length > 1 ? 's' : ''
    } could proceed with conditions such as a co-applicant or collateral.`;
  }
  return 'No lender policy currently matches this profile. Reduce the loan ask or add a co-applicant, then re-run.';
}
