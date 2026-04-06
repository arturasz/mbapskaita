/**
 * @deprecated Legacy tax calculations. Use optimizer.ts instead.
 * Kept for backward compatibility with existing tests.
 */
import type {
  AnnualTaxSummary,
  Income,
  Expense,
  MonthlySodra,
  QuarterlyGPM,
  Quarter,
} from "../types";
import { getTaxRates } from "../data/tax-rates";

type MBIncomeMode = "civil_contract" | "profit_withdrawal";

export interface TaxOptions {
  activityStartDate?: string;
  incomeMode?: MBIncomeMode;
  voluntarySodra?: boolean;
}

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
    const sodraBase = taxableIncome;
    const inDiscount = isInSodraDiscountPeriod(year, options?.activityStartDate);
    const mmaAnnualBase = rates.minMonthlyWage * 12;

    const vsdBase = inDiscount
      ? Math.min(sodraBase, mmaAnnualBase)
      : sodraBase;
    const cappedVsdBase = Math.min(vsdBase, rates.sodraCeiling);

    vsdAmount = round2(cappedVsdBase * rates.vsdMember);
    psdAmount = round2(sodraBase * rates.psd);

    const gpmBase = Math.max(0, taxableIncome - vsdAmount - psdAmount);
    gpmAmount = round2(gpmBase * rates.gpmCivilContract);
  } else {
    if (options?.voluntarySodra) {
      const mmaAnnualBase = rates.minMonthlyWage * 12;
      vsdAmount = round2(mmaAnnualBase * rates.vsdMember);
      psdAmount = round2(mmaAnnualBase * rates.psd);
    } else {
      const mmaAnnualBase = rates.minMonthlyWage * 12;
      vsdAmount = 0;
      psdAmount = round2(mmaAnnualBase * rates.psd);
    }

    gpmAmount = round2(taxableIncome * rates.gpmCivilContract);
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

export function isInSodraDiscountPeriod(
  year: number,
  activityStartDate?: string,
): boolean {
  if (!activityStartDate) return false;
  const startYear = new Date(activityStartDate).getFullYear();
  return year >= startYear && year < startYear + 2;
}

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
    let vsdBase: number;

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
      vsdAmount = round2(cappedVsd * rates.vsdMember);
      psdAmount = round2(monthlyBase * rates.psd);
    } else {
      if (options?.voluntarySodra) {
        vsdBase = mmaMonthly;
        vsdAmount = round2(mmaMonthly * rates.vsdMember);
        psdAmount = round2(mmaMonthly * rates.psd);
      } else {
        vsdBase = 0;
        vsdAmount = 0;
        psdAmount = round2(mmaMonthly * rates.psd);
      }
    }

    const total = round2(vsdAmount + psdAmount);
    cumulative = round2(cumulative + total);

    const stazasMonths = mmaMonthly > 0
      ? round2(Math.min(1, vsdBase / mmaMonthly))
      : 0;
    stazasCum = round2(stazasCum + stazasMonths);

    months.push({
      month: m,
      vsdAmount,
      psdAmount,
      employerSodra: 0,
      total,
      cumulative,
      stazasMonths,
      stazasCumulative: stazasCum,
    });
  }

  return months;
}

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
      const vsdYTD = round2(cappedVsd * rates.vsdMember);
      const psdYTD = round2(sodraBase * rates.psd);
      const gpmBaseYTD = Math.max(0, taxableYTD - vsdYTD - psdYTD);
      gpmYTD = round2(gpmBaseYTD * rates.gpmCivilContract);
    } else {
      gpmYTD = round2(taxableYTD * rates.gpmCivilContract);
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
