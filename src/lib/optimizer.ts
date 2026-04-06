import type {
  Income,
  Expense,
  WithdrawalPlan,
  WithdrawalBreakdown,
  OptimizedTaxResult,
  Obligation,
  MonthlySodra,
} from "../types";
import { getTaxRates } from "../data/tax-rates";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate optimized tax breakdown across selected withdrawal methods.
 *
 * Methods:
 * - salary (darbo sutartis): GPM 20%, employee VSD+PSD, employer Sodra. Gives stažas.
 * - civilContract (civilinė sutartis): GPM 15%, VSD+PSD. Gives stažas. Watch 45k VAT.
 * - dividends (pelno išėmimas): GPM 15%. No Sodra except mandatory PSD from MMA.
 *
 * Allocation priority: salary first, then civil contract, rest to dividends.
 */
export function calculateOptimizedTax(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  plan: WithdrawalPlan,
): OptimizedTaxResult {
  const rates = getTaxRates(year);

  const totalIncome = incomes
    .filter((i) => i.date.startsWith(String(year)))
    .reduce((sum, i) => sum + i.amountEur, 0);

  const totalExpenses = expenses
    .filter((e) => e.date.startsWith(String(year)))
    .reduce((sum, e) => sum + e.amountEur, 0);

  const mbProfit = Math.max(0, totalIncome - totalExpenses);

  const withdrawals: WithdrawalBreakdown[] = [];
  let remaining = mbProfit;
  let hasSodraStazas = false; // track if any method provides stažas

  // 1. Salary (darbo sutartis)
  if (plan.salaryEnabled && plan.salaryMonthly > 0) {
    const annualGross = Math.min(plan.salaryMonthly * 12, remaining);
    const vsd = r2(Math.min(annualGross, rates.sodraCeiling) * rates.vsd);
    const psd = r2(annualGross * rates.psd);
    const gpmBase = Math.max(0, annualGross - vsd - psd);
    const gpm = r2(gpmBase * rates.gpmEmployment);
    const employerSodra = r2(annualGross * rates.employerSodra);
    const totalTax = r2(gpm + vsd + psd + employerSodra);

    // Stažas: proportional to salary vs MMA
    const stazas = r2(Math.min(12, (annualGross / 12) / rates.minMonthlyWage * 12));

    withdrawals.push({
      method: "salary",
      label: "Darbo sutartis (alga)",
      amount: annualGross,
      gpm,
      gpmRate: rates.gpmEmployment,
      vsd,
      psd,
      employerSodra,
      totalTax,
      netAmount: r2(annualGross - gpm - vsd - psd),
      stazasMonths: Math.min(12, stazas),
    });

    remaining = r2(remaining - annualGross - employerSodra); // employer Sodra is MB expense
    hasSodraStazas = true;
  }

  // 2. Civil contract (civilinė sutartis)
  if (plan.civilContractEnabled && plan.civilContractAnnual > 0) {
    const amount = Math.min(plan.civilContractAnnual, remaining);
    const vsd = r2(Math.min(amount, rates.sodraCeiling) * rates.vsd);
    const psd = r2(amount * rates.psd);
    const gpmBase = Math.max(0, amount - vsd - psd);
    const gpm = r2(gpmBase * rates.gpm);
    const totalTax = r2(gpm + vsd + psd);

    const stazas = r2(Math.min(12, (amount / 12) / rates.minMonthlyWage * 12));

    withdrawals.push({
      method: "civilContract",
      label: "Civilinė sutartis",
      amount,
      gpm,
      gpmRate: rates.gpm,
      vsd,
      psd,
      employerSodra: 0,
      totalTax,
      netAmount: r2(amount - totalTax),
      stazasMonths: Math.min(12, stazas),
    });

    remaining = r2(remaining - amount);
    hasSodraStazas = true;
  }

  // 3. Dividends (pelno išėmimas) — gets whatever is left
  if (plan.dividendsEnabled && remaining > 0) {
    const amount = remaining;
    const gpm = r2(amount * rates.gpmDividends);

    // Mandatory PSD from MMA if no other Sodra source
    const needsMandatoryPsd = !hasSodraStazas;
    const mandatoryPsd = needsMandatoryPsd
      ? r2(rates.minMonthlyWage * 12 * rates.psd)
      : 0;

    const totalTax = r2(gpm + mandatoryPsd);

    withdrawals.push({
      method: "dividends",
      label: "Pelno išėmimas (dividendai)",
      amount,
      gpm,
      gpmRate: rates.gpmDividends,
      vsd: 0,
      psd: mandatoryPsd,
      employerSodra: 0,
      totalTax,
      netAmount: r2(amount - totalTax),
      stazasMonths: 0,
    });

    remaining = 0;
  }

  const totalGpm = r2(withdrawals.reduce((s, w) => s + w.gpm, 0));
  const totalVsd = r2(withdrawals.reduce((s, w) => s + w.vsd, 0));
  const totalPsd = r2(withdrawals.reduce((s, w) => s + w.psd, 0));
  const totalEmployerSodra = r2(withdrawals.reduce((s, w) => s + w.employerSodra, 0));
  const totalTax = r2(totalGpm + totalVsd + totalPsd + totalEmployerSodra);
  const totalNet = r2(withdrawals.reduce((s, w) => s + w.netAmount, 0));
  const stazasMonths = Math.min(
    12,
    r2(withdrawals.reduce((s, w) => s + w.stazasMonths, 0)),
  );

  // Stažas already counted across methods — cap at 12
  const civilContractTotal = withdrawals
    .filter((w) => w.method === "civilContract")
    .reduce((s, w) => s + w.amount, 0);

  return {
    year,
    totalIncome: r2(totalIncome),
    totalExpenses: r2(totalExpenses),
    mbProfit: r2(mbProfit),
    withdrawals,
    totalGpm,
    totalVsd,
    totalPsd,
    totalEmployerSodra,
    totalTax,
    totalNet,
    effectiveRate: mbProfit > 0 ? r2(totalTax / mbProfit) : 0,
    stazasMonths,
    vatWarning: civilContractTotal > rates.vatThreshold,
    remainingInMB: r2(remaining),
  };
}

/**
 * Generate monthly Sodra breakdown based on withdrawal plan.
 */
export function calculateMonthlySodraFromPlan(
  year: number,
  plan: WithdrawalPlan,
): MonthlySodra[] {
  const rates = getTaxRates(year);
  const months: MonthlySodra[] = [];
  let cumulative = 0;
  let stazasCum = 0;

  for (let m = 1; m <= 12; m++) {
    let vsd = 0;
    let psd = 0;
    let employer = 0;
    let vsdBase = 0;

    if (plan.salaryEnabled && plan.salaryMonthly > 0) {
      const base = plan.salaryMonthly;
      vsdBase += base;
      vsd += r2(Math.min(base, rates.sodraCeiling / 12) * rates.vsd);
      psd += r2(base * rates.psd);
      employer += r2(base * rates.employerSodra);
    }

    if (plan.civilContractEnabled && plan.civilContractAnnual > 0) {
      const monthlyBase = plan.civilContractAnnual / 12;
      vsdBase += monthlyBase;
      vsd += r2(Math.min(monthlyBase, rates.sodraCeiling / 12) * rates.vsd);
      psd += r2(monthlyBase * rates.psd);
    }

    // If no salary/civil contract, mandatory PSD from MMA
    if (!plan.salaryEnabled && !plan.civilContractEnabled && plan.dividendsEnabled) {
      psd = r2(rates.minMonthlyWage * rates.psd);
    }

    vsd = r2(vsd);
    psd = r2(psd);
    employer = r2(employer);
    const total = r2(vsd + psd + employer);
    cumulative = r2(cumulative + total);

    const stazas = rates.minMonthlyWage > 0
      ? r2(Math.min(1, vsdBase / rates.minMonthlyWage))
      : 0;
    stazasCum = r2(stazasCum + stazas);

    months.push({
      month: m,
      vsdAmount: vsd,
      psdAmount: psd,
      employerSodra: employer,
      total,
      cumulative,
      stazasMonths: stazas,
      stazasCumulative: stazasCum,
    });
  }

  return months;
}

/**
 * Generate obligations timeline for the year.
 */
export function generateObligations(
  year: number,
  plan: WithdrawalPlan,
  result: OptimizedTaxResult,
): Obligation[] {
  const obligations: Obligation[] = [];
  const hasSodra = plan.salaryEnabled || plan.civilContractEnabled;
  const monthlySodra = result.totalVsd + result.totalPsd + result.totalEmployerSodra;
  const monthlySodraAmount = monthlySodra > 0 ? r2(monthlySodra / 12) : 0;

  // Monthly Sodra (if applicable)
  if (hasSodra) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "Sodra įmokos",
        description: `VSD + PSD mėnesinės įmokos${plan.salaryEnabled ? " + darbdavio dalis" : ""}`,
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        amount: monthlySodraAmount,
        recurring: "monthly",
        category: "sodra",
      });
    }
  }

  // Mandatory PSD even for dividends-only
  if (!hasSodra && plan.dividendsEnabled) {
    for (let m = 1; m <= 12; m++) {
      const rates = getTaxRates(year);
      obligations.push({
        name: "PSD įmoka (privaloma)",
        description: "Minimali PSD nuo MMA",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        amount: r2(rates.minMonthlyWage * rates.psd),
        recurring: "monthly",
        category: "sodra",
      });
    }
  }

  // SAV reports (if Sodra is paid)
  if (hasSodra) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "SAV pranešimas",
        description: "Sodra SAV pranešimas per Sodra portalą",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        recurring: "monthly",
        category: "declaration",
      });
    }
  }

  // GPM withholding (if salary or civil contract)
  if (plan.salaryEnabled || plan.civilContractEnabled) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "GPM deklaracija (FR0572)",
        description: "Mėnesinė GPM deklaracija VMI",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        recurring: "monthly",
        category: "gpm",
      });
    }
  }

  // Annual GPM declaration
  obligations.push({
    name: "Metinė GPM deklaracija (GPM314)",
    description: "Metinė pajamų deklaracija",
    dueDate: `${year + 1}-05-01`,
    recurring: "annual",
    category: "declaration",
  });

  // Annual financial statements
  obligations.push({
    name: "Finansinė atskaitomybė",
    description: "Metinė ataskaita Registrų centrui",
    dueDate: `${year + 1}-06-30`,
    recurring: "annual",
    category: "declaration",
  });

  return obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
