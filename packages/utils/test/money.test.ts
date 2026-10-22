import { describe, expect, it } from 'vitest';
import { computeEmi, estimateEducationLoan, formatInr } from '../src/money';
import { computeCostCertainty } from '../src/costs';

describe('money math', () => {
  it('computes a standard reducing-balance EMI', () => {
    expect(computeEmi(1_000_000, 10, 120)).toBeGreaterThan(13_000);
    expect(computeEmi(1_000_000, 10, 120)).toBeLessThan(13_500);
  });

  it('capitalises moratorium interest for education loans', () => {
    const loan = estimateEducationLoan({
      principal: 1_000_000,
      annualRate: 10,
      tenureMonths: 120,
      moratoriumMonths: 54,
    });
    expect(loan.moratoriumInterest).toBe(450_000);
    expect(loan.capitalisedPrincipal).toBe(1_450_000);
    expect(loan.monthlyEmi).toBeGreaterThan(19_000);
  });

  it('formats Indian lakh grouping', () => {
    expect(formatInr(1234567)).toBe('₹12,34,567');
  });
});

describe('cost certainty', () => {
  const schedules = ['2025-26', '2026-27', '2027-28', '2028-29'].map((academicYear, index) => ({
    academicYear,
    tuition: 200_000 + index * 10_000,
    hostel: 60_000,
    mess: 50_000,
    oneTime: index === 0 ? 25_000 : 0,
    other: 10_000,
    verified: true,
    sourceType: 'OFFICIAL',
    sourceLabel: 'Official fee circular',
    updatedAt: new Date('2025-06-01'),
  }));

  it('sums a four-year all-in cost and marks strong coverage high confidence', () => {
    const result = computeCostCertainty({
      durationMonths: 48,
      schedules,
      feeSlips: [
        { academicYear: '2025-26', total: 345_000, verifiedAt: new Date() },
        { academicYear: '2025-26', total: 349_000, verifiedAt: new Date() },
        { academicYear: '2026-27', total: 355_000, verifiedAt: new Date() },
      ],
    });
    expect(result.academicYears).toHaveLength(4);
    expect(result.grandTotal).toBeGreaterThan(1_300_000);
    expect(result.tuitionTotal).toBe(860_000);
    expect(result.confidence.label).toBe('HIGH');
    expect(result.confidence.verifiedFeeSlipCount).toBe(3);
  });

  it('projects missing years instead of under-reporting cost', () => {
    const result = computeCostCertainty({
      durationMonths: 48,
      schedules: schedules.slice(0, 2),
      feeSlips: [],
    });
    expect(result.academicYears).toHaveLength(4);
    expect(result.academicYears[3]?.tuition).toBeGreaterThan(schedules[1]!.tuition);
    expect(result.confidence.label).not.toBe('HIGH');
  });
});
