import type { OutcomeSourceType } from '@clarity/types';
import { estimateEducationLoan } from './money';

export interface CostScheduleRow {
  academicYear: string;
  tuition: number;
  hostel: number;
  mess: number;
  oneTime: number;
  other: number;
  verified: boolean;
  sourceType: string;
  sourceLabel: string;
  updatedAt?: Date;
}

export interface FeeSlipObservation {
  academicYear: string;
  total: number;
  verifiedAt?: Date | null;
}

export interface CostLine {
  key: string;
  label: string;
  amount: number;
  perYear: boolean;
  note: string | null;
}

export interface CostYear {
  academicYear: string;
  label: string;
  tuition: number;
  hostel: number;
  mess: number;
  oneTime: number;
  other: number;
  total: number;
}

export interface CostConfidence {
  score: number;
  label: 'HIGH' | 'MEDIUM' | 'LOW';
  verifiedScheduleCount: number;
  verifiedFeeSlipCount: number;
  feeSlipVariancePct: number | null;
  reasons: string[];
}

export interface CostCertaintyResult {
  durationMonths: number;
  durationYears: number;
  academicYears: CostYear[];
  breakdown: CostLine[];
  tuitionTotal: number;
  livingTotal: number;
  oneTimeTotal: number;
  otherTotal: number;
  grandTotal: number;
  averageAnnualCost: number;
  annualEscalationPct: number;
  confidence: CostConfidence;
  sources: Array<{
    label: string;
    type: 'OFFICIAL_SCHEDULE' | 'CROWDSOURCED_SLIP' | 'INSTITUTION_WEBSITE';
    verified: boolean;
    records: number;
    lastUpdated: string | null;
  }>;
  lastUpdated: string;
  financingEstimate: {
    principal: number;
    annualRate: number;
    tenureMonths: number;
    monthlyEmi: number;
    totalInterest: number;
    totalRepayment: number;
    moratoriumMonths: number;
  };
}

const yearStart = (academicYear: string): number => {
  const [start] = academicYear.split('-');
  return Number(start) || 0;
};

export function computeCostCertainty(params: {
  durationMonths: number;
  schedules: CostScheduleRow[];
  feeSlips: FeeSlipObservation[];
  annualEscalationPct?: number;
  loanRate?: number;
  loanTenureMonths?: number;
  graceMonths?: number;
}): CostCertaintyResult {
  const durationYears = Math.max(1, Math.ceil(params.durationMonths / 12));
  const escalation = params.annualEscalationPct ?? 6;
  const sorted = [...params.schedules]
    .filter((row) => row.tuition > 0)
    .sort((a, b) => yearStart(a.academicYear) - yearStart(b.academicYear));

  const lastProvided = sorted[sorted.length - 1];
  const firstProvided = sorted[0];
  const academicYears: CostYear[] = [];
  let previous: CostYear | null = null;

  for (let index = 0; index < durationYears; index += 1) {
    const provided = sorted[index];
    if (provided) {
      const row: CostYear = {
        academicYear: provided.academicYear,
        label: index === 0 ? 'Year 1' : `Year ${index + 1}`,
        tuition: provided.tuition,
        hostel: provided.hostel,
        mess: provided.mess,
        oneTime: provided.oneTime,
        other: provided.other,
        total:
          provided.tuition + provided.hostel + provided.mess + provided.oneTime + provided.other,
      };
      academicYears.push(row);
      previous = row;
    } else {
      const start = (firstProvided ? yearStart(firstProvided.academicYear) : 2026) + index;
      const source = previous ?? lastProvided;
      const baseIndex = Math.max(0, sorted.length - 1);
      const factor = Math.pow(1 + escalation / 100, Math.max(0, index - baseIndex));
      const row: CostYear = {
        academicYear: `${start}-${String((start + 1) % 100).padStart(2, '0')}`,
        label: `Year ${index + 1}`,
        tuition: Math.round((source?.tuition ?? 0) * factor),
        hostel: Math.round((source?.hostel ?? 0) * factor),
        mess: Math.round((source?.mess ?? 0) * factor),
        oneTime: 0,
        other: Math.round((source?.other ?? 0) * factor),
        total: 0,
      };
      row.total = row.tuition + row.hostel + row.mess + row.oneTime + row.other;
      academicYears.push(row);
      previous = row;
    }
  }

  const tuitionTotal = academicYears.reduce((sum, year) => sum + year.tuition, 0);
  const hostelTotal = academicYears.reduce((sum, year) => sum + year.hostel, 0);
  const messTotal = academicYears.reduce((sum, year) => sum + year.mess, 0);
  const livingTotal = hostelTotal + messTotal;
  const oneTimeTotal = academicYears.reduce((sum, year) => sum + year.oneTime, 0);
  const otherTotal = academicYears.reduce((sum, year) => sum + year.other, 0);
  const grandTotal = tuitionTotal + livingTotal + oneTimeTotal + otherTotal;

  const verifiedSchedules = sorted.filter((row) => row.verified);
  const verifiedSlips = params.feeSlips;

  const perYearTotals = new Map<string, number>();
  for (const year of academicYears) perYearTotals.set(year.academicYear, year.total);
  const varianceSamples = verifiedSlips
    .map((slip) => {
      const scheduled = perYearTotals.get(slip.academicYear);
      if (!scheduled || scheduled <= 0) return null;
      return Math.abs(slip.total - scheduled) / scheduled;
    })
    .filter((value): value is number => value !== null);
  const feeSlipVariancePct =
    varianceSamples.length > 0
      ? Number(
          ((varianceSamples.reduce((sum, value) => sum + value, 0) / varianceSamples.length) * 100).toFixed(1),
        )
      : null;

  let score = 28;
  const reasons: string[] = [];
  if (sorted.length >= durationYears && verifiedSchedules.length >= durationYears) {
    score += 32;
    reasons.push('Official verified cost schedule covers every year of study.');
  } else if (verifiedSchedules.length > 0) {
    score += 18;
    reasons.push(`Verified official schedule covers ${verifiedSchedules.length} of ${durationYears} years.`);
  } else {
    reasons.push('No verified official schedule yet — costs are model estimates.');
  }
  if (verifiedSlips.length > 0) {
    score += Math.min(20, 6 + verifiedSlips.length * 3);
    reasons.push(
      `${verifiedSlips.length} KYC-verified student fee slip${
        verifiedSlips.length > 1 ? 's' : ''
      } corroborate the schedule.`,
    );
    if (feeSlipVariancePct !== null && feeSlipVariancePct < 8) {
      score += 10;
      reasons.push(`Verified slips vary only ${feeSlipVariancePct}% from the schedule.`);
    } else if (feeSlipVariancePct !== null && feeSlipVariancePct < 18) {
      score += 5;
      reasons.push(`Verified slips vary ${feeSlipVariancePct}% from the schedule.`);
    } else if (feeSlipVariancePct !== null) {
      reasons.push(
        `Verified slips vary ${feeSlipVariancePct}% from the schedule — check hostel/mess inclusions.`,
      );
    }
  } else {
    reasons.push('No verified peer fee slips yet. Upload yours to raise certainty.');
  }
  const latestUpdate = sorted.reduce<Date | null>((latest, row) => {
    if (!row.updatedAt) return latest;
    return !latest || row.updatedAt > latest ? row.updatedAt : latest;
  }, null);
  if (latestUpdate && new Date().getFullYear() - latestUpdate.getFullYear() <= 1) {
    score += 8;
  }
  score = Math.min(98, score);
  const label = score >= 80 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW';

  const averageAnnualCost = Math.round(grandTotal / durationYears);
  const financing = estimateEducationLoan({
    principal: grandTotal,
    annualRate: params.loanRate ?? 10.5,
    tenureMonths: params.loanTenureMonths ?? 120,
    moratoriumMonths: params.durationMonths + (params.graceMonths ?? 6),
  });

  const sources: CostCertaintyResult['sources'] = [];
  if (sorted.length > 0) {
    sources.push({
      label: sorted[0]?.sourceLabel ?? 'Official cost schedule',
      type: 'OFFICIAL_SCHEDULE',
      verified: verifiedSchedules.length > 0,
      records: sorted.length,
      lastUpdated: latestUpdate?.toISOString() ?? null,
    });
  }
  if (verifiedSlips.length > 0) {
    sources.push({
      label: 'KYC-verified student fee slips',
      type: 'CROWDSOURCED_SLIP',
      verified: true,
      records: verifiedSlips.length,
      lastUpdated:
        verifiedSlips
          .map((slip) => slip.verifiedAt)
          .filter((date): date is Date => Boolean(date))
          .sort((a, b) => b.getTime() - a.getTime())[0]
          ?.toISOString() ?? null,
    });
  }
  sources.push({
    label: 'Institution website & public fee circulars',
    type: 'INSTITUTION_WEBSITE',
    verified: false,
    records: sorted.length,
    lastUpdated: latestUpdate?.toISOString() ?? null,
  });

  return {
    durationMonths: params.durationMonths,
    durationYears,
    academicYears,
    breakdown: [
      {
        key: 'tuition',
        label: 'Tuition & academic fees',
        amount: tuitionTotal,
        perYear: true,
        note: 'Includes tuition and standard academic charges',
      },
      {
        key: 'hostel',
        label: 'Hostel & accommodation',
        amount: hostelTotal,
        perYear: true,
        note: 'On-campus room rent for the full programme',
      },
      {
        key: 'mess',
        label: 'Mess & living',
        amount: messTotal,
        perYear: true,
        note: 'Standard mess plan; excludes personal expenses',
      },
      {
        key: 'oneTime',
        label: 'One-time charges',
        amount: oneTimeTotal,
        perYear: false,
        note: 'Admission, caution deposit, orientation',
      },
      {
        key: 'other',
        label: 'Other academic charges',
        amount: otherTotal,
        perYear: true,
        note: 'Lab, library, exam and activity fees',
      },
    ],
    tuitionTotal,
    livingTotal,
    oneTimeTotal,
    otherTotal,
    grandTotal,
    averageAnnualCost,
    annualEscalationPct: escalation,
    confidence: {
      score,
      label,
      verifiedScheduleCount: verifiedSchedules.length,
      verifiedFeeSlipCount: verifiedSlips.length,
      feeSlipVariancePct,
      reasons,
    },
    sources,
    lastUpdated: latestUpdate?.toISOString() ?? new Date().toISOString(),
    financingEstimate: {
      principal: financing.principal,
      annualRate: financing.annualRate,
      tenureMonths: financing.tenureMonths,
      monthlyEmi: financing.monthlyEmi,
      totalInterest: financing.totalInterest + financing.moratoriumInterest,
      totalRepayment: financing.totalRepayment,
      moratoriumMonths: financing.moratoriumMonths,
    },
  };
}

export interface OutcomeRowInput {
  id: string;
  type: OutcomeSourceType;
  label: string;
  year: number;
  sampleSize: number;
  placementRate: number;
  medianSalary: number;
  p25Salary: number;
  p75Salary: number;
  confidence: number;
  notes: string | null;
}

export interface OutcomeAggregate {
  employmentRate: number;
  medianSalary: number;
  p25Salary: number;
  p75Salary: number;
  confidence: number;
  totalSampleSize: number;
  aiRiskLabel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  methodology: string;
}

const SOURCE_WEIGHT: Record<OutcomeSourceType, number> = {
  OFFICIAL: 0.4,
  GOVT_SURVEY: 0.25,
  ALUMNI_SURVEY: 0.25,
  CROWDSOURCED: 0.1,
};

/**
 * Never trusts one placement cell. Weighted triangulation with an explicit
 * agreement penalty so conflicting sources reduce confidence.
 */
export function triangulateOutcomes(rows: OutcomeRowInput[]): OutcomeAggregate {
  if (rows.length === 0) {
    return {
      employmentRate: 0,
      medianSalary: 0,
      p25Salary: 0,
      p75Salary: 0,
      confidence: 0,
      totalSampleSize: 0,
      aiRiskLabel: 'LOW',
      methodology: 'No outcome sources available.',
    };
  }
  const weighted = rows.map((row) => ({
    row,
    weight:
      SOURCE_WEIGHT[row.type] *
      (0.5 + Math.min(1, row.confidence)) *
      Math.min(1.4, Math.max(0.4, Math.log10(Math.max(10, row.sampleSize)))),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const wMean = (selector: (row: OutcomeRowInput) => number): number =>
    Math.round(
      weighted.reduce((sum, item) => sum + selector(item.row) * item.weight, 0) / totalWeight,
    );
  const employmentRate = Number(
    (
      weighted.reduce((sum, item) => sum + item.row.placementRate * item.weight, 0) / totalWeight
    ).toFixed(3),
  );

  const medianSalary = wMean((row) => row.medianSalary);
  const p25Salary = wMean((row) => row.p25Salary);
  const p75Salary = wMean((row) => row.p75Salary);
  const totalSampleSize = rows.reduce((sum, row) => sum + row.sampleSize, 0);
  const uniqueTypes = new Set(rows.map((row) => row.type)).size;

  const medians = rows.map((row) => row.medianSalary).filter((value) => value > 0);
  const meanOfMedians = medians.reduce((sum, value) => sum + value, 0) / Math.max(1, medians.length);
  const variance =
    medians.reduce((sum, value) => sum + Math.pow(value - meanOfMedians, 2), 0) /
    Math.max(1, medians.length);
  const cv = meanOfMedians > 0 ? Math.sqrt(variance) / meanOfMedians : 1;

  const sourceDiversity = Math.min(1, uniqueTypes / 3);
  const sampleStrength = Math.min(1, totalSampleSize / 2000);
  const agreement = Math.max(0, 1 - cv * 1.9);
  const base = sourceDiversity * 0.35 + sampleStrength * 0.35 + agreement * 0.3;
  const confidence = Number(
    Math.min(uniqueTypes === 1 ? 0.55 : 0.94, Math.max(0.25, base)).toFixed(2),
  );

  return {
    employmentRate,
    medianSalary,
    p25Salary,
    p75Salary,
    confidence,
    totalSampleSize,
    aiRiskLabel: 'LOW',
    methodology: `${rows.length} sources triangulated (${uniqueTypes} independent source types). Weighted by source reliability, stated confidence and sample size; median dispersion of ${Math.round(
      cv * 100,
    )}% is priced into the confidence score. Official placement cells alone are capped at low confidence.`,
  };
}

export function aiRiskFromExposure(exposure: number): 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' {
  if (exposure <= 0.3) return 'LOW';
  if (exposure <= 0.5) return 'MODERATE';
  if (exposure <= 0.7) return 'HIGH';
  return 'SEVERE';
}
