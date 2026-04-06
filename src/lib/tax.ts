import type {
  AnnualTaxSummary,
  Income,
  Expense,
  MonthlySodra,
  QuarterlyGPM,
  Quarter,
  MBIncomeMode,
} from "../types";
import { getTaxRates } from "../data/tax-rates";

export interface TaxOptions {
  activityStartDate?: string;
  incomeMode?: MBIncomeMode;
  voluntarySodra?: boolean;
}

/**
 * Calculate annual tax summary for an MB solo member.
 *
 * Two modes:
 *
 * 1. civil_contract — narys dirba pagal civilinę sutartį su MB.
 *    - Sodra (VSD+PSD) skaičiuojama nuo faktinių išmokų (taxableIncome).
 *    - GPM 15% nuo (taxableIncome - VSD - PSD).
 *
 * 2. profit_withdrawal — narys išsiima pelną (pelno išėmimas).
 *    - GPM 15% nuo išimto pelno.
 *    - Sodra neprivalo mokėti per MB.
 *    - Jei voluntarySodra = true, moka savanoriškai nuo MMA bazės (stažui rinkti).
 */
export function calculateAnnualTax(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  options?: TaxOptions,
): AnnualTaxSummary {
  const rates = getTaxRates(year);
  const mode = options?.incomeMode ?? "civil_contract";

  const totalIncome = incomes
    .filter((i) => i.date.startsWith(String(year)))
    .reduce((sum, i) => sum + i.amountEur, 0);

  const totalExpenses = expenses
    .filter((e) => e.date.startsWith(String(year)))
    .reduce((sum, e) => sum + e.amountEur, 0);

  const taxableIncome = Math.max(0, totalIncome - totalExpenses);

  let vsdAmount: number;
  let psdAmount: number;
  let gpmAmount: number;

  if (mode === "civil_contract") {
    // Sodra nuo faktinių išmokų
    const sodraBase = taxableIncome;

    const inDiscount = isInSodraDiscountPeriod(year, options?.activityStartDate);
    const mmaAnnualBase = rates.minMonthlyWage * 12;

    const vsdBase = inDiscount
      ? Math.min(sodraBase, mmaAnnualBase)
      : sodraBase;
    const cappedVsdBase = Math.min(vsdBase, rates.sodraCeiling);

    vsdAmount = round2(cappedVsdBase * rates.vsd);
    psdAmount = round2(sodraBase * rates.psd);

    // GPM nuo (taxableIncome - Sodra)
    const gpmBase = Math.max(0, taxableIncome - vsdAmount - psdAmount);
    gpmAmount = round2(gpmBase * rates.gpm);
  } else {
    // profit_withdrawal — tik GPM, Sodra savanoriška
    if (options?.voluntarySodra) {
      // Savanoriška Sodra nuo MMA bazės — stažui rinkti
      const mmaAnnualBase = rates.minMonthlyWage * 12;
      vsdAmount = round2(mmaAnnualBase * rates.vsd);
      psdAmount = round2(mmaAnnualBase * rates.psd);
    } else {
      // PSD vis tiek privaloma (minimali), VSD ne
      const mmaAnnualBase = rates.minMonthlyWage * 12;
      vsdAmount = 0;
      psdAmount = round2(mmaAnnualBase * rates.psd); // privaloma PSD nuo MMA
    }

    // GPM nuo viso pelno (Sodra neatskaičiuojama iš bazės)
    gpmAmount = round2(taxableIncome * rates.gpm);
  }

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
 * Calculate monthly Sodra contributions with stažas tracking.
 *
 * Stažas: 1 mėn. stažo = VSD sumokėta nuo >= 1 MMA bazės.
 * Jei bazė < MMA, stažas proporcingai mažesnis.
 */
export function calculateMonthlySodra(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  options?: TaxOptions,
): MonthlySodra[] {
  const rates = getTaxRates(year);
  const mode = options?.incomeMode ?? "civil_contract";
  const inDiscount = isInSodraDiscountPeriod(year, options?.activityStartDate);
  const mmaMonthly = rates.minMonthlyWage;
  const months: MonthlySodra[] = [];
  let cumulative = 0;
  let stazasCum = 0;

  for (let m = 1; m <= 12; m++) {
    let vsdAmount: number;
    let psdAmount: number;
    let vsdBase: number; // for stažas calculation

    if (mode === "civil_contract") {
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
      const projectedAnnual = m > 0 ? (ytdProfit / m) * 12 : 0;
      const monthlyBase = projectedAnnual / 12;

      const vsdMonthlyBase = inDiscount
        ? Math.min(monthlyBase, mmaMonthly)
        : monthlyBase;
      const cappedVsd = Math.min(vsdMonthlyBase, rates.sodraCeiling / 12);

      vsdBase = cappedVsd;
      vsdAmount = round2(cappedVsd * rates.vsd);
      psdAmount = round2(monthlyBase * rates.psd);
    } else {
      // profit_withdrawal
      if (options?.voluntarySodra) {
        vsdBase = mmaMonthly;
        vsdAmount = round2(mmaMonthly * rates.vsd);
        psdAmount = round2(mmaMonthly * rates.psd);
      } else {
        vsdBase = 0;
        vsdAmount = 0;
        psdAmount = round2(mmaMonthly * rates.psd);
      }
    }

    const total = round2(vsdAmount + psdAmount);
    cumulative = round2(cumulative + total);

    // Stažas: proportional to VSD base vs MMA
    const stazasMonths = mmaMonthly > 0
      ? round2(Math.min(1, vsdBase / mmaMonthly))
      : 0;
    stazasCum = round2(stazasCum + stazasMonths);

    months.push({ month: m, vsdAmount, psdAmount, total, cumulative, stazasMonths, stazasCumulative: stazasCum });
  }

  return months;
}

/**
 * Calculate quarterly GPM advance payments.
 */
export function calculateQuarterlyGPM(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  options?: TaxOptions,
): QuarterlyGPM[] {
  const rates = getTaxRates(year);
  const mode = options?.incomeMode ?? "civil_contract";
  const inDiscount = isInSodraDiscountPeriod(year, options?.activityStartDate);
  const mmaAnnualBase = rates.minMonthlyWage * 12;
  const quarters: QuarterlyGPM[] = [];
  let previousAdvances = 0;

  for (const q of [1, 2, 3, 4] as Quarter[]) {
    const endMonth = q * 3;

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
    let gpmYTD: number;

    if (mode === "civil_contract") {
      const sodraBase = taxableYTD;
      const vsdBase = inDiscount ? Math.min(sodraBase, mmaAnnualBase) : sodraBase;
      const cappedVsd = Math.min(vsdBase, rates.sodraCeiling);
      const vsdYTD = round2(cappedVsd * rates.vsd);
      const psdYTD = round2(sodraBase * rates.psd);
      const gpmBaseYTD = Math.max(0, taxableYTD - vsdYTD - psdYTD);
      gpmYTD = round2(gpmBaseYTD * rates.gpm);
    } else {
      gpmYTD = round2(taxableYTD * rates.gpm);
    }

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
