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
 * Calculate optimized tax breakdown for an MB sole member.
 *
 * MB sole member/director CANNOT have darbo sutartis with their own MB.
 *
 * Available methods:
 * - civilContract: civilinė sutartis — GPM 15%, VSD+PSD from payments, stažas.
 *   Watch 45k EUR VAT threshold.
 * - dividends: pelno išėmimas — GPM 15%, no Sodra.
 *
 * Independent Sodra option:
 * - sodraSelf: register as self-employed with Sodra, pay VSD+PSD from chosen base
 *   (min MMA). This gives stažas regardless of withdrawal method.
 *   Sodra cost is separate from withdrawal — it's a personal obligation.
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

  const targetWithdrawal = plan.withdrawAll
    ? mbProfit
    : Math.min(plan.withdrawalTarget, mbProfit);

  const withdrawals: WithdrawalBreakdown[] = [];
  let remaining = targetWithdrawal;

  // 1. Civil contract (civilinė sutartis)
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
  }

  // 2. Dividends (pelno išėmimas) — gets the rest
  if (plan.dividendsEnabled && remaining > 0) {
    const amount = remaining;
    const gpm = r2(amount * rates.gpmDividends);
    const totalTax = r2(gpm);

    withdrawals.push({
      method: "dividends",
      label: "Pelno išėmimas",
      amount,
      gpm,
      gpmRate: rates.gpmDividends,
      vsd: 0,
      psd: 0,
      employerSodra: 0,
      totalTax,
      netAmount: r2(amount - totalTax),
      stazasMonths: 0,
    });

    remaining = 0;
  }

  // 3. Independent Sodra for stažas (savarankiškai dirbantis asmuo)
  // This is NOT a withdrawal method — it's a personal Sodra contribution
  // that gives stažas. The cost comes from personal funds (net income).
  let sodraSelfVsd = 0;
  let sodraSelfPsd = 0;
  let sodraSelfStazas = 0;

  const civilContractStazas = withdrawals
    .filter((w) => w.method === "civilContract")
    .reduce((s, w) => s + w.stazasMonths, 0);

  if (plan.sodraSelfEnabled) {
    const monthlyBase = plan.sodraSelfBase > 0
      ? Math.max(plan.sodraSelfBase, rates.minMonthlyWage)
      : rates.minMonthlyWage;
    // Only pay Sodra for months not already covered by civil contract stažas
    const monthsNeeded = Math.max(0, 12 - Math.floor(civilContractStazas));

    sodraSelfVsd = r2(Math.min(monthlyBase * monthsNeeded, rates.sodraCeiling) * rates.vsd);
    sodraSelfPsd = r2(monthlyBase * monthsNeeded * rates.psd);
    sodraSelfStazas = r2(Math.min(monthsNeeded, monthsNeeded * monthlyBase / rates.minMonthlyWage));
  } else {
    // Mandatory PSD from MMA even without voluntary Sodra
    // (every resident must have PSD coverage)
    const hasPsdFromCivilContract = withdrawals.some(
      (w) => w.method === "civilContract" && w.psd > 0,
    );
    if (!hasPsdFromCivilContract) {
      sodraSelfPsd = r2(rates.minMonthlyWage * 12 * rates.psd);
    }
  }

  const totalGpm = r2(withdrawals.reduce((s, w) => s + w.gpm, 0));
  const totalVsd = r2(withdrawals.reduce((s, w) => s + w.vsd, 0) + sodraSelfVsd);
  const totalPsd = r2(withdrawals.reduce((s, w) => s + w.psd, 0) + sodraSelfPsd);
  const totalEmployerSodra = 0; // no employer Sodra for MB sole member
  const totalTax = r2(totalGpm + totalVsd + totalPsd);
  const totalNet = r2(withdrawals.reduce((s, w) => s + w.netAmount, 0) - sodraSelfVsd - sodraSelfPsd);
  const stazasMonths = Math.min(12, r2(civilContractStazas + sodraSelfStazas));

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
    effectiveRate: targetWithdrawal > 0 ? r2(totalTax / targetWithdrawal) : 0,
    stazasMonths,
    vatWarning: civilContractTotal > rates.vatThreshold,
    remainingInMB: r2(mbProfit - targetWithdrawal + remaining),
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
    let vsdBase = 0;

    // Civil contract Sodra
    if (plan.civilContractEnabled && plan.civilContractAnnual > 0) {
      const monthlyBase = plan.civilContractAnnual / 12;
      vsdBase += monthlyBase;
      vsd += r2(Math.min(monthlyBase, rates.sodraCeiling / 12) * rates.vsd);
      psd += r2(monthlyBase * rates.psd);
    }

    // Independent Sodra for stažas
    if (plan.sodraSelfEnabled) {
      const base = plan.sodraSelfBase > 0
        ? Math.max(plan.sodraSelfBase, rates.minMonthlyWage)
        : rates.minMonthlyWage;
      // Only add if civil contract doesn't already cover this month's stažas
      if (vsdBase < rates.minMonthlyWage) {
        const additional = base - vsdBase;
        if (additional > 0) {
          vsdBase += additional;
          vsd += r2(Math.min(additional, rates.sodraCeiling / 12) * rates.vsd);
          psd += r2(additional * rates.psd);
        }
      }
    }

    // Mandatory PSD if nothing else
    if (vsd === 0 && psd === 0 && plan.dividendsEnabled) {
      psd = r2(rates.minMonthlyWage * rates.psd);
    }

    vsd = r2(vsd);
    psd = r2(psd);
    const total = r2(vsd + psd);
    cumulative = r2(cumulative + total);

    const stazas = rates.minMonthlyWage > 0
      ? r2(Math.min(1, vsdBase / rates.minMonthlyWage))
      : 0;
    stazasCum = r2(stazasCum + stazas);

    months.push({
      month: m,
      vsdAmount: vsd,
      psdAmount: psd,
      employerSodra: 0,
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
  const hasSodra = plan.civilContractEnabled || plan.sodraSelfEnabled;
  const monthlySodra = result.totalVsd + result.totalPsd;
  const monthlySodraAmount = monthlySodra > 0 ? r2(monthlySodra / 12) : 0;

  // Monthly Sodra
  if (hasSodra) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "Sodra įmokos",
        description: "VSD + PSD mėnesinės įmokos",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        amount: monthlySodraAmount,
        recurring: "monthly",
        category: "sodra",
      });
    }
  }

  // Mandatory PSD even for dividends-only
  if (!hasSodra && plan.dividendsEnabled) {
    const rates = getTaxRates(year);
    for (let m = 1; m <= 12; m++) {
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

  // SAV reports
  if (hasSodra) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "SAV pranešimas",
        description: "Sodra SAV pranešimas",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        recurring: "monthly",
        category: "declaration",
      });
    }
  }

  // GPM withholding for civil contract
  if (plan.civilContractEnabled) {
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

  // Annual declarations
  obligations.push({
    name: "Metinė GPM deklaracija (GPM314)",
    description: "Metinė pajamų deklaracija",
    dueDate: `${year + 1}-05-01`,
    recurring: "annual",
    category: "declaration",
  });

  obligations.push({
    name: "Finansinė atskaitomybė",
    description: "Metinė ataskaita Registrų centrui",
    dueDate: `${year + 1}-06-30`,
    recurring: "annual",
    category: "declaration",
  });

  return obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
