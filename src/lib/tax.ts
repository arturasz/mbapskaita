import type { AnnualTaxSummary, Income, Expense } from "../types";
import { getTaxRates } from "../data/tax-rates";

export interface TaxOptions {
  activityStartDate?: string; // ISO date
}

/**
 * Calculate annual tax summary for an MB solo member.
 *
 * MB members pay:
 * - GPM 15% on withdrawn profit (treated as self-employment income)
 * - VSD 12.52% on declared income (up to Sodra ceiling)
 * - PSD 6.98% on declared income
 *
 * The base for Sodra (VSD+PSD) is 90% of profit for MB members.
 *
 * First 2 years discount (VSDFĮ 10 str.):
 * - During first 2 calendar years of activity, VSD contributions are
 *   calculated from MMA base (12 * MMA) instead of 90% profit,
 *   if the latter is higher. PSD remains on full base.
 */
export function calculateAnnualTax(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  options?: TaxOptions,
): AnnualTaxSummary {
  const rates = getTaxRates(year);

  const totalIncome = incomes
    .filter((i) => i.date.startsWith(String(year)))
    .reduce((sum, i) => sum + i.amountEur, 0);

  const totalExpenses = expenses
    .filter((e) => e.date.startsWith(String(year)))
    .reduce((sum, e) => sum + e.amountEur, 0);

  const taxableIncome = Math.max(0, totalIncome - totalExpenses);

  // Sodra base is 90% of profit for MB members
  const fullSodraBase = taxableIncome * 0.9;

  // First 2 years: VSD from MMA base if it's lower
  const inDiscountPeriod = isInSodraDiscountPeriod(year, options?.activityStartDate);
  const mmaAnnualBase = rates.minMonthlyWage * 12;

  const vsdBase = inDiscountPeriod
    ? Math.min(fullSodraBase, mmaAnnualBase)
    : fullSodraBase;
  const cappedVsdBase = Math.min(vsdBase, rates.sodraCeiling);

  const vsdAmount = round2(cappedVsdBase * rates.vsd);
  const psdAmount = round2(fullSodraBase * rates.psd); // PSD — no discount, no ceiling

  // GPM is on taxable income minus Sodra contributions
  const gpmBase = Math.max(0, taxableIncome - vsdAmount - psdAmount);
  const gpmAmount = round2(gpmBase * rates.gpm);

  const totalTax = round2(gpmAmount + vsdAmount + psdAmount);
  const netIncome = round2(taxableIncome - totalTax);
  const effectiveRate = taxableIncome > 0 ? round2(totalTax / taxableIncome) : 0;

  return {
    year,
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
    taxableIncome: round2(taxableIncome),
    gpmAmount,
    vsdAmount,
    psdAmount,
    totalTax,
    effectiveRate,
    netIncome,
  };
}

/**
 * Check if a given tax year falls within the first 2 calendar years of activity.
 * E.g. if activity started 2025-06-15, discount applies in 2025 and 2026.
 */
export function isInSodraDiscountPeriod(
  year: number,
  activityStartDate?: string,
): boolean {
  if (!activityStartDate) return false;
  const startYear = new Date(activityStartDate).getFullYear();
  return year >= startYear && year < startYear + 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
