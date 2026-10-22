import { describe, expect, it } from 'vitest';
import { buildRiskInput, runRiskEngine } from '../src/monte-carlo';

const base = buildRiskInput({
  principal: 1_500_000,
  courseDurationMonths: 48,
  medianAnnualSalary: 1_800_000,
  placementRate: 0.9,
  iterations: 2000,
  seed: 42,
});

describe('Monte Carlo risk engine', () => {
  it('is deterministic for a given seed', () => {
    const first = runRiskEngine(base);
    const second = runRiskEngine(base);
    expect(first.metrics.probabilityOfDistress).toBe(second.metrics.probabilityOfDistress);
    expect(first.metrics.medianTotalInterest).toBe(second.metrics.medianTotalInterest);
    expect(first.cashflow[11]?.p50).toBe(second.cashflow[11]?.p50);
  });

  it('produces bounded probabilities and sensible percentiles', () => {
    const result = runRiskEngine(base);
    expect(result.metrics.probabilityOfDistress).toBeGreaterThanOrEqual(0);
    expect(result.metrics.probabilityOfDistress).toBeLessThanOrEqual(1);
    expect(result.metrics.firstYearSalary.p10).toBeLessThanOrEqual(
      result.metrics.firstYearSalary.p50,
    );
    expect(result.metrics.firstYearSalary.p50).toBeLessThanOrEqual(
      result.metrics.firstYearSalary.p90,
    );
    expect(result.cashflow).toHaveLength(60);
    expect(result.scenarios).toHaveLength(6);
  });

  it('shows more stress under the combined stress scenario than the base case', () => {
    const result = runRiskEngine(base);
    const baseScenario = result.scenarios.find((scenario) => scenario.key === 'BASE');
    const stress = result.scenarios.find((scenario) => scenario.key === 'COMBINED_STRESS');
    expect(stress?.probabilityOfDistress).toBeGreaterThan(
      baseScenario?.probabilityOfDistress ?? 0,
    );
  });

  it('flags an unaffordable loan as critical', () => {
    const risky = runRiskEngine(
      buildRiskInput({
        principal: 4_000_000,
        courseDurationMonths: 48,
        medianAnnualSalary: 350_000,
        placementRate: 0.55,
        iterations: 800,
        seed: 7,
      }),
    );
    expect(['ELEVATED', 'CRITICAL']).toContain(risky.metrics.riskBand);
  });
});
