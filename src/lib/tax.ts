import type {
  AnnualTaxSummary,
  Income,
  Expense,
  MonthlySodra,
  QuarterlyGPM,
  Quarter,
} from "../types";
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

/**
 * Calculate monthly Sodra contributions.
 * Sodra is paid monthly by the 15th. Each month's contribution is 1/12 of annual.
 * Uses year-to-date income to estimate the annual base.
 */
export function calculateMonthlySodra(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  options?: TaxOptions,
): MonthlySodra[] {
  const rates = getTaxRates(year);
  const inDiscount = isInSodraDiscountPeriod(year, options?.activityStartDate);
  const mmaAnnualBase = rates.minMonthlyWage * 12;
  const months: MonthlySodra[] = [];
  let cumulative = 0;

  for (let m = 1; m <= 12; m++) {
    const ytdIncome = incomes
      .filter((i) => {
        const d = new Date(i.date);
        return d.getFullYear() === year && d.getMonth() < m;
      })
      .reduce((s, i) => s + i.amountEur, 0);

    const ytdExpenses = expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() < m;
      })
      .reduce((s, e) => s + e.amountEur, 0);

    const ytdProfit = Math.max(0, ytdIncome - ytdExpenses);
    // Project annual from YTD
    const projectedAnnual = m > 0 ? (ytdProfit / m) * 12 : 0;
    const fullSodraBase = projectedAnnual * 0.9;
    const monthlyBase = fullSodraBase / 12;

    const vsdMonthlyBase = inDiscount
      ? Math.min(monthlyBase, mmaAnnualBase / 12)
      : monthlyBase;
    const cappedVsd = Math.min(vsdMonthlyBase, rates.sodraCeiling / 12);

    const vsdAmount = round2(cappedVsd * rates.vsd);
    const psdAmount = round2(monthlyBase * rates.psd);
    const total = round2(vsdAmount + psdAmount);
    cumulative = round2(cumulative + total);

    months.push({ month: m, vsdAmount, psdAmount, total, cumulative });
  }

  return months;
}

/**
 * Calculate quarterly GPM advance payments.
 * Advance GPM is paid quarterly by the 15th of the month after quarter end.
 * Each quarter recalculates YTD tax and subtracts previous advances.
 */
export function calculateQuarterlyGPM(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  options?: TaxOptions,
): QuarterlyGPM[] {
  const rates = getTaxRates(year);
  const inDiscount = isInSodraDiscountPeriod(year, options?.activityStartDate);
  const mmaAnnualBase = rates.minMonthlyWage * 12;
  const quarters: QuarterlyGPM[] = [];
  let previousAdvances = 0;

  for (const q of [1, 2, 3, 4] as Quarter[]) {
    const endMonth = q * 3; // Q1=3, Q2=6, Q3=9, Q4=12

    const ytdIncome = incomes
      .filter((i) => {
        const d = new Date(i.date);
        return d.getFullYear() === year && d.getMonth() < endMonth;
      })
      .reduce((s, i) => s + i.amountEur, 0);

    const ytdExpenses = expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() < endMonth;
      })
      .reduce((s, e) => s + e.amountEur, 0);

    const taxableYTD = Math.max(0, ytdIncome - ytdExpenses);
    const fullSodraBase = taxableYTD * 0.9;
    const vsdBase = inDiscount ? Math.min(fullSodraBase, mmaAnnualBase) : fullSodraBase;
    const cappedVsd = Math.min(vsdBase, rates.sodraCeiling);

    const vsdYTD = round2(cappedVsd * rates.vsd);
    const psdYTD = round2(fullSodraBase * rates.psd);
    const gpmBaseYTD = Math.max(0, taxableYTD - vsdYTD - psdYTD);
    const gpmYTD = round2(gpmBaseYTD * rates.gpm);
    const gpmAdvance = round2(Math.max(0, gpmYTD - previousAdvances));

    quarters.push({
      quarter: q,
      incomeYTD: round2(ytdIncome),
      expensesYTD: round2(ytdExpenses),
      taxableYTD: round2(taxableYTD),
      gpmYTD,
      gpmAdvance,
      previousAdvances: round2(previousAdvances),
    });

    previousAdvances = round2(previousAdvances + gpmAdvance);
  }

  return quarters;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
