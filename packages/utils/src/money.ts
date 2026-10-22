/**
 * Money & loan math. All amounts are whole Indian rupees.
 * Rates are annual percentages (e.g. 10.5 means 10.5%).
 */

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const roundRupees = (value: number): number => Math.round(value);

/** Standard reducing-balance EMI. */
export function computeEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number,
): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate === 0) return roundRupees(principal / tenureMonths);
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return roundRupees((principal * monthlyRate * factor) / (factor - 1));
}

/** Invert EMI to find the principal a borrower can service at a given EMI. */
export function computeAffordablePrincipal(
  monthlyEmi: number,
  annualRate: number,
  tenureMonths: number,
): number {
  if (monthlyEmi <= 0 || tenureMonths <= 0) return 0;
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate === 0) return roundRupees(monthlyEmi * tenureMonths);
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  return roundRupees((monthlyEmi * (factor - 1)) / (monthlyRate * factor));
}

/**
 * Education loans accrue simple interest during the study + grace moratorium.
 * We capitalise that interest at repayment start (the conservative model used
 * by most Indian lenders for EMI illustration).
 */
export function capitaliseMoratoriumInterest(
  principal: number,
  annualRate: number,
  moratoriumMonths: number,
): number {
  const interest = (principal * annualRate * Math.max(0, moratoriumMonths)) / 12 / 100;
  return roundRupees(principal + interest);
}

export interface LoanEstimate {
  principal: number;
  moratoriumMonths: number;
  moratoriumInterest: number;
  capitalisedPrincipal: number;
  annualRate: number;
  tenureMonths: number;
  monthlyEmi: number;
  totalInterest: number;
  totalRepayment: number;
}

export function estimateEducationLoan(params: {
  principal: number;
  annualRate: number;
  tenureMonths: number;
  moratoriumMonths: number;
}): LoanEstimate {
  const { principal, annualRate, tenureMonths, moratoriumMonths } = params;
  const moratoriumInterest = roundRupees(
    (principal * annualRate * Math.max(0, moratoriumMonths)) / 12 / 100,
  );
  const capitalisedPrincipal = principal + moratoriumInterest;
  const monthlyEmi = computeEmi(capitalisedPrincipal, annualRate, tenureMonths);
  const totalRepayment = monthlyEmi * tenureMonths;
  return {
    principal,
    moratoriumMonths,
    moratoriumInterest,
    capitalisedPrincipal,
    annualRate,
    tenureMonths,
    monthlyEmi,
    totalInterest: totalRepayment - capitalisedPrincipal,
    totalRepayment,
  };
}

export interface AmortizationRow {
  month: number;
  openingBalance: number;
  interest: number;
  principalPaid: number;
  emi: number;
  closingBalance: number;
}

export function buildAmortization(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  emi = computeEmi(principal, annualRate, tenureMonths),
): AmortizationRow[] {
  const monthlyRate = annualRate / 12 / 100;
  let balance = principal;
  const rows: AmortizationRow[] = [];
  for (let month = 1; month <= tenureMonths && balance > 0.5; month += 1) {
    const interest = roundRupees(balance * monthlyRate);
    const principalPaid = Math.min(balance, roundRupees(emi - interest));
    const closingBalance = Math.max(0, roundRupees(balance - principalPaid));
    rows.push({
      month,
      openingBalance: roundRupees(balance),
      interest,
      principalPaid,
      emi,
      closingBalance,
    });
    balance = closingBalance;
  }
  return rows;
}

/** Indian numbering system, e.g. ₹12,34,567. */
export function formatInr(value: number, options?: { paise?: boolean }): string {
  const showPaise = options?.paise ?? false;
  const abs = Math.abs(value);
  const [whole, decimals] = abs.toFixed(showPaise ? 2 : 0).split('.');
  const lastThree = (whole ?? '0').slice(-3);
  const other = (whole ?? '0').slice(0, -3);
  const grouped = other
    ? `${other.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`
    : lastThree;
  return `${value < 0 ? '-' : ''}₹${grouped}${decimals ? `.${decimals}` : ''}`;
}

/** Compact lakh/crore formatting used on cards and charts. */
export function formatInrCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 0 : 2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(abs >= 10_00_000 ? 0 : 2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(0)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
