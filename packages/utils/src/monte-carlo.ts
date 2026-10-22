import type { RiskBand, RiskInputs, RiskScenarioKey, RiskScenarioResult } from '@clarity/types';
import { formatInrCompact } from './money';
import { clamp } from './money';
import { lognormal, mulberry32, normal, quantile } from './random';

export interface SimulatedMetrics {
  probabilityOfDistress: number;
  probabilityEmiOver50: number;
  medianMonthsToPayoff: number;
  p90MonthsToPayoff: number;
  medianTotalInterest: number;
  p90TotalInterest: number;
  medianEmergencyRunwayMonths: number;
  p10EmergencyRunwayMonths: number;
  firstYearSalary: { p10: number; p50: number; p90: number };
  monthlyEmi: number;
  dtiAtP50: number;
  riskBand: RiskBand;
  resilienceScore: number;
  verdict: string;
}

export interface CashflowPoint {
  month: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface DtiBucket {
  bucket: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface StressCell {
  salary: number;
  loan: number;
  distressProbability: number;
  riskBand: RiskBand;
}

export interface RiskEngineOutput {
  inputs: RiskInputs;
  metrics: SimulatedMetrics;
  scenarios: RiskScenarioResult[];
  cashflow: CashflowPoint[];
  dtiDistribution: DtiBucket[];
  stressMap: StressCell[];
  narrative: string[];
  sampling: {
    iterations: number;
    seed: number;
    deterministic: true;
    method: string;
  };
}

const METHOD =
  'Path simulation with deterministic mulberry32 PRNG. Log-normal entry salary, binomial placement with AI-hiring shock, stochastic job delay, annual salary growth, floating-rate hike events, and simple-interest moratorium capitalisation. Distress = EMI + existing EMI above 40% of salary for 3+ consecutive months.';

interface PathOutcome {
  distress: boolean;
  emiOver50: boolean;
  monthsToPayoff: number;
  totalInterest: number;
  delayMonths: number;
  firstYearSalary: number;
  monthlyEmi: number;
  dti: number;
  surplusY1: number;
  cumulativeCashflow: number[] | null;
}

function buildEmi(principal: number, annualRate: number, tenureMonths: number): number {
  const r = annualRate / 12 / 100;
  if (principal <= 0 || tenureMonths <= 0) return 0;
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

function simulatePath(rand: () => number, input: RiskInputs, collectCashflow: boolean): PathOutcome {
  const tenure = Math.max(1, input.tenureMonths);
  const emiStart = Math.max(0, input.moratoriumMonths - input.courseDurationMonths);
  const horizon = emiStart + tenure + 24;

  const effectivePlacement = clamp(
    input.placementProbability * (1 - (input.aiHiringShockPct / 100) * 0.55),
    0.02,
    0.995,
  );
  const hired = rand() < effectivePlacement;
  const salaryShock = 1 - (input.aiHiringShockPct / 100) * 0.35;

  let delayMonths = input.jobDelayMonths;
  if (hired) {
    const draw = rand();
    delayMonths += draw < 0.45 ? 0 : draw < 0.7 ? 2 : draw < 0.88 ? 4 : draw < 0.96 ? 7 : 12;
  } else {
    delayMonths += 12 + Math.floor(rand() * 13);
  }

  const expectedSalary = Math.max(0, input.expectedMonthlySalary);
  const firstSalary = hired
    ? lognormal(rand, expectedSalary * salaryShock, 0.27)
    : lognormal(rand, expectedSalary * 0.7 * salaryShock, 0.2);

  const growthYears: number[] = [];
  for (let year = 0; year < 16; year += 1) {
    growthYears.push(clamp(normal(rand, input.salaryGrowthPct, 3.5), -6, 26));
  }

  const salaryAt = (month: number): number => {
    if (month <= delayMonths || firstSalary <= 0) return 0;
    const employedYears = (month - delayMonths) / 12;
    const wholeYears = Math.floor(employedYears);
    let compound = 1;
    for (let year = 0; year < wholeYears; year += 1) {
      compound *= 1 + (growthYears[year] ?? 8) / 100;
    }
    const partial = employedYears - wholeYears;
    const partialRate = ((growthYears[wholeYears] ?? 8) / 100) * partial;
    return firstSalary * compound * (1 + partialRate);
  };

  const baseRate = input.annualRate;
  const rateHikeApplied = input.rateHikeBps > 0 && rand() < 0.34;
  const effectiveRate = baseRate + (rateHikeApplied ? input.rateHikeBps / 100 : 0);

  const capitalised =
    input.principal * (1 + (baseRate * Math.max(input.moratoriumMonths, 0)) / 12 / 100);
  const monthlyEmi = Math.round(buildEmi(capitalised, effectiveRate, tenure));

  let balance = capitalised;
  let monthsToPayoff = tenure + 24;
  let totalInterest = 0;
  let distressMonths = 0;
  let over50Months = 0;
  let everDistressed = false;
  let everOver50 = false;
  const dtiValues: number[] = [];
  const cumulative: number[] = collectCashflow ? [] : (null as unknown as number[]);
  let cumulativeSurplus = 0;
  let surplusY1 = 0;
  const monthlyRate = effectiveRate / 12 / 100;

  for (let month = 1; month <= horizon; month += 1) {
    const salary = salaryAt(month);
    const emiDue = month > emiStart;
    const emi = emiDue ? monthlyEmi : 0;
    const living = salary * (input.livingCostPct / 100);
    const net = salary - living - input.existingEmi - emi;

    if (month <= 60) {
      cumulativeSurplus += net;
      if (collectCashflow) cumulative.push(cumulativeSurplus);
      if (month === 13) surplusY1 = salary - living - input.existingEmi - emi;
    }

    if (emiDue) {
      const dti = salary > 0 ? (monthlyEmi + input.existingEmi) / salary : 2;
      dtiValues.push(Math.min(dti, 2));
      if (dti > 0.4) {
        distressMonths += 1;
        if (distressMonths >= 3) everDistressed = true;
      } else {
        distressMonths = 0;
      }
      if (salary > 0 && dti > 0.5) {
        over50Months += 1;
        if (over50Months >= 3) everOver50 = true;
      } else {
        over50Months = 0;
      }

      const interest = balance * monthlyRate;
      const principalPaid = monthlyEmi - interest;
      if (principalPaid > 0) {
        balance -= principalPaid;
        totalInterest += interest;
      } else {
        balance += -principalPaid;
      }
      if (balance <= 0.5) {
        monthsToPayoff = month - emiStart;
        break;
      }
    }
  }

  const dtiSorted = [...dtiValues].sort((a, b) => a - b);
  const dti = dtiSorted.length > 0 ? (quantile(dtiSorted, 0.5) ?? 0) : 0;

  return {
    distress: everDistressed,
    emiOver50: everOver50,
    monthsToPayoff: Math.round(monthsToPayoff),
    totalInterest: Math.round(totalInterest),
    delayMonths,
    firstYearSalary: Math.round(salaryAt(13) * 12),
    monthlyEmi,
    dti,
    surplusY1: Math.round(surplusY1),
    cumulativeCashflow: collectCashflow ? cumulative : null,
  };
}

function riskBandFor(probability: number): RiskBand {
  if (probability < 0.08) return 'RESILIENT';
  if (probability < 0.2) return 'MANAGEABLE';
  if (probability < 0.4) return 'ELEVATED';
  return 'CRITICAL';
}

function verdictFor(probability: number, dti: number): string {
  if (probability < 0.08 && dti < 0.35) {
    return 'Your expected salary can absorb this loan with room to spare.';
  }
  if (probability < 0.2) {
    return 'Manageable in the base case, but a quiet placement season would sting.';
  }
  if (probability < 0.4) {
    return 'A meaningful share of simulated futures put this EMI under real strain.';
  }
  return 'This repayment plan needs a smaller loan, a co-applicant buffer, or a longer tenure.';
}

function resilienceScoreFor(probability: number, dti: number, runwayMonths: number): number {
  const headroom = clamp((0.45 - dti) / 0.45, 0, 1);
  const runwayPenalty = clamp((runwayMonths - 6) / 18, 0, 1) * 8;
  const raw = 100 - probability * 95 - Math.max(0, dti - 0.3) * 55 + headroom * 12 - runwayPenalty;
  return Math.round(clamp(raw, 0, 100));
}

interface AggregateResult {
  metrics: SimulatedMetrics;
  cashflow: CashflowPoint[];
  dtiDistribution: DtiBucket[];
  delays: number[];
}

function aggregate(input: RiskInputs, collectCashflow: boolean): AggregateResult {
  const rand = mulberry32(input.seed);
  const outcomes: PathOutcome[] = [];
  for (let i = 0; i < input.iterations; i += 1) {
    outcomes.push(simulatePath(rand, input, collectCashflow));
  }

  const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
  const probs = (
    predicate: (outcome: PathOutcome) => boolean,
  ): number => {
    const hits = outcomes.filter(predicate).length;
    return Number((hits / outcomes.length).toFixed(4));
  };

  const probabilities = probs((o) => o.distress);
  const emiOver50Probability = probs((o) => o.emiOver50);
  const payoffMonths = sorted(outcomes.map((o) => o.monthsToPayoff));
  const interests = sorted(outcomes.map((o) => o.totalInterest));
  const delays = sorted(outcomes.map((o) => o.delayMonths));
  const dtis = sorted(outcomes.map((o) => o.dti));
  const salaries = sorted(outcomes.map((o) => o.firstYearSalary));
  const emis = sorted(outcomes.map((o) => o.monthlyEmi));

  const medianP90 = quantile(payoffMonths, 0.9) ?? 0;
  const dtiP50 = quantile(dtis, 0.5) ?? 0;
  const medianInterest = quantile(interests, 0.5) ?? 0;
  const medianRunway = quantile(delays, 0.5) ?? 0;
  const runwayP10 = quantile(delays, 0.1) ?? 0;
  const score = resilienceScoreFor(probabilities, dtiP50, medianRunway);

  const cashflow: CashflowPoint[] = [];
  if (collectCashflow) {
    for (let month = 1; month <= 60; month += 1) {
      const values = outcomes.map((o) => o.cumulativeCashflow?.[month - 1] ?? 0);
      const sortedValues = sorted(values);
      cashflow.push({
        month,
        p10: Math.round(quantile(sortedValues, 0.1) ?? 0),
        p50: Math.round(quantile(sortedValues, 0.5) ?? 0),
        p90: Math.round(quantile(sortedValues, 0.9) ?? 0),
      });
    }
  }

  const buckets = [
    { bucket: '0–10%', min: 0, max: 0.1 },
    { bucket: '10–20%', min: 0.1, max: 0.2 },
    { bucket: '20–30%', min: 0.2, max: 0.3 },
    { bucket: '30–40%', min: 0.3, max: 0.4 },
    { bucket: '40–50%', min: 0.4, max: 0.5 },
    { bucket: '50–60%', min: 0.5, max: 0.6 },
    { bucket: '60–100%', min: 0.6, max: 1 },
    { bucket: '100%+', min: 1, max: 999 },
  ];
  const dtiDistribution: DtiBucket[] = buckets.map((bucket) => {
    const count = outcomes.filter((o) => o.dti >= bucket.min && o.dti < bucket.max).length;
    return {
      ...bucket,
      count,
      pct: Number((count / outcomes.length).toFixed(4)),
    };
  });

  return {
    metrics: {
      probabilityOfDistress: probabilities,
      probabilityEmiOver50: emiOver50Probability,
      medianMonthsToPayoff: Math.round(quantile(payoffMonths, 0.5) ?? 0),
      p90MonthsToPayoff: Math.round(medianP90),
      medianTotalInterest: Math.round(medianInterest),
      p90TotalInterest: Math.round(quantile(interests, 0.9) ?? 0),
      medianEmergencyRunwayMonths: Number(medianRunway.toFixed(1)),
      p10EmergencyRunwayMonths: Number(runwayP10.toFixed(1)),
      firstYearSalary: {
        p10: Math.round(quantile(salaries, 0.1) ?? 0),
        p50: Math.round(quantile(salaries, 0.5) ?? 0),
        p90: Math.round(quantile(salaries, 0.9) ?? 0),
      },
      monthlyEmi: Math.round(quantile(emis, 0.5) ?? 0),
      dtiAtP50: Number(dtiP50.toFixed(3)),
      riskBand: riskBandFor(probabilities),
      resilienceScore: score,
      verdict: verdictFor(probabilities, dtiP50),
    },
    cashflow,
    dtiDistribution,
    delays,
  };
}

type ScenarioOverrides = Partial<RiskInputs> & {
  expectedMonthlySalaryMultiplier?: number;
};

interface ScenarioDefinition {
  key: RiskScenarioKey;
  label: string;
  description: string;
  overrides: ScenarioOverrides;
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    key: 'BASE',
    label: 'Base case',
    description: 'Everything follows the most likely path.',
    overrides: {},
  },
  {
    key: 'AI_SHOCK',
    label: 'AI hiring shock',
    description: 'Entry-level hiring contracts and salary bands soften.',
    overrides: { aiHiringShockPct: 20 },
  },
  {
    key: 'QUIET_P25',
    label: 'Quiet season (25th percentile)',
    description: 'You land at the 25th percentile salary, not the median.',
    overrides: { expectedMonthlySalaryMultiplier: 0.75 },
  },
  {
    key: 'DELAYED_START',
    label: 'Delayed first job',
    description: 'Nine extra months pass before your first paycheque.',
    overrides: { jobDelayMonths: 9 },
  },
  {
    key: 'RATE_HIKE',
    label: 'Rate hike',
    description: 'A 200 bps floating-rate hike lands during repayment.',
    overrides: { rateHikeBps: 200 },
  },
  {
    key: 'COMBINED_STRESS',
    label: 'Combined stress',
    description: 'AI shock, a quiet placement year, delay and a rate hike together.',
    overrides: {
      aiHiringShockPct: 25,
      expectedMonthlySalaryMultiplier: 0.75,
      jobDelayMonths: 9,
      rateHikeBps: 250,
    },
  },
];

function applyScenario(input: RiskInputs, overrides: ScenarioOverrides): RiskInputs {
  const { expectedMonthlySalaryMultiplier, ...rest } = overrides;
  return {
    ...input,
    ...rest,
    ...(expectedMonthlySalaryMultiplier
      ? {
          expectedMonthlySalary: Math.round(
            input.expectedMonthlySalary * expectedMonthlySalaryMultiplier,
          ),
        }
      : {}),
    salaryGrowthPct: input.salaryGrowthPct,
  };
}

export interface BuildStressMapOptions {
  iterations?: number;
  seed?: number;
  salaryAxis?: number[];
  loanAxis?: number[];
}

export function buildStressMap(
  input: RiskInputs,
  options: BuildStressMapOptions = {},
): { cells: StressCell[]; salaryAxis: number[]; loanAxis: number[] } {
  const iterations = options.iterations ?? 1000;
  const baseSalary = Math.max(20_000, input.expectedMonthlySalary);
  const salaryAxis =
    options.salaryAxis ?? [0.7, 0.85, 1, 1.15, 1.3].map((m) => Math.round((baseSalary * m) / 1000) * 1000);
  const loanAxis =
    options.loanAxis ??
    [0.8, 0.9, 1, 1.1, 1.2].map((m) => Math.round((input.principal * m) / 100_000) * 100_000);
  const cells: StressCell[] = [];

  salaryAxis.forEach((salary, salaryIndex) => {
    loanAxis.forEach((loan, loanIndex) => {
      const cellResult = aggregate(
        {
          ...input,
          expectedMonthlySalary: salary,
          principal: loan,
          iterations,
          seed: (options.seed ?? input.seed) + salaryIndex * 17 + loanIndex * 131 + 7,
        },
        false,
      );
      cells.push({
        salary,
        loan,
        distressProbability: cellResult.metrics.probabilityOfDistress,
        riskBand: cellResult.metrics.riskBand,
      });
    });
  });

  return { cells, salaryAxis, loanAxis };
}

export function runRiskEngine(input: RiskInputs): RiskEngineOutput {
  const main = aggregate(input, true);

  const scenarios: RiskScenarioResult[] = SCENARIOS.map((scenario, index) => {
    const scenarioInput = applyScenario(input, scenario.overrides);
    if (scenario.key !== 'BASE') {
      scenarioInput.seed = input.seed + (index + 1) * 977;
    }
    const result = scenario.key === 'BASE' ? main : aggregate(scenarioInput, false);
    return {
      key: scenario.key,
      label: scenario.label,
      description: scenario.description,
      probabilityOfDistress: result.metrics.probabilityOfDistress,
      probabilityEmiOver50: result.metrics.probabilityEmiOver50,
      medianMonthsToPayoff: result.metrics.medianMonthsToPayoff,
      medianTotalInterest: result.metrics.medianTotalInterest,
      medianMonthlySurplusY1:
        Math.round(
          result.metrics.firstYearSalary.p50 > 0
            ? (result.metrics.firstYearSalary.p50 / 12) *
                (1 - input.livingCostPct / 100) -
                result.metrics.monthlyEmi -
                input.existingEmi
            : -result.metrics.monthlyEmi - input.existingEmi,
        ),
      monthlyEmi: result.metrics.monthlyEmi,
      riskBand: result.metrics.riskBand,
      verdict: result.metrics.verdict,
    };
  });

  const stress = buildStressMap(input, {
    iterations: Math.max(250, Math.min(600, Math.round(input.iterations / 12))),
    seed: input.seed + 4507,
  });

  const metrics = main.metrics;
  const narrative = [
    `At a median starting salary of ${formatInrCompact(
      metrics.firstYearSalary.p50 / 12,
    )} per month, the modelled EMI of ${formatInrCompact(
      metrics.monthlyEmi,
    )} absorbs ${Math.round(metrics.dtiAtP50 * 100)}% of take-home pay.`,
    `${Math.round(metrics.probabilityOfDistress * 100)}% of ${input.iterations.toLocaleString(
      'en-IN',
    )} simulated futures include at least three consecutive months where debt payments exceed 40% of salary.`,
    `The 10th-percentile gap between graduation and first salary is ${metrics.p10EmergencyRunwayMonths.toFixed(
      0,
    )} months; median is ${metrics.medianEmergencyRunwayMonths.toFixed(0)} months.`,
    `Under an AI-hiring shock, distress probability moves to ${Math.round(
      (scenarios.find((s) => s.key === 'AI_SHOCK')?.probabilityOfDistress ?? 0) * 100,
    )}%.`,
  ];

  return {
    inputs: input,
    metrics,
    scenarios,
    cashflow: main.cashflow,
    dtiDistribution: main.dtiDistribution,
    stressMap: stress.cells,
    narrative,
    sampling: {
      iterations: input.iterations,
      seed: input.seed,
      deterministic: true,
      method: METHOD,
    },
  };
}

export function defaultRiskSeed(): number {
  return 20261022;
}

/**
 * Build the engine input from a study loan + placement profile using sensible
 * Indian education-loan defaults. Kept pure so the API and tests share it.
 */
export function buildRiskInput(params: {
  principal: number;
  courseDurationMonths: number;
  medianAnnualSalary: number;
  p25AnnualSalary?: number;
  placementRate?: number;
  annualRate?: number;
  tenureMonths?: number;
  graceMonths?: number;
  existingEmi?: number;
  iterations?: number;
  seed?: number;
  aiHiringShockPct?: number;
  jobDelayMonths?: number;
  rateHikeBps?: number;
}): RiskInputs {
  const courseDurationMonths = params.courseDurationMonths;
  const graceMonths = params.graceMonths ?? 6;
  return {
    principal: params.principal,
    annualRate: params.annualRate ?? 10.5,
    tenureMonths: params.tenureMonths ?? 120,
    moratoriumMonths: courseDurationMonths + graceMonths,
    courseDurationMonths,
    expectedMonthlySalary: Math.round((params.medianAnnualSalary || 600_000) / 12),
    salaryGrowthPct: 8,
    livingCostPct: 32,
    existingEmi: params.existingEmi ?? 0,
    placementProbability: params.placementRate ?? 0.82,
    aiHiringShockPct: params.aiHiringShockPct ?? 20,
    jobDelayMonths: params.jobDelayMonths ?? 0,
    rateHikeBps: params.rateHikeBps ?? 0,
    iterations: params.iterations ?? 10_000,
    seed: params.seed ?? defaultRiskSeed(),
  };
}
