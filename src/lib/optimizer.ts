import type {
  Income,
  Expense,
  WithdrawalPlan,
  WithdrawalBreakdown,
  OptimizedTaxResult,
  Obligation,
  MonthlySodra,
} from "../types";
import { getTaxRates, calculateProgressiveGPM } from "../data/tax-rates";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Optimized tax calculation for MB sole member.
 *
 * Two withdrawal methods (can combine):
 *
 * 1. Civilinė sutartis (code 77) — MB expense, reduces MB profit.
 *    - GPM: 15% flat (2024-2025), progressive 15-32% (2026+)
 *    - VSD: 0%, PSD: 0% — NO Sodra, no stažas
 *    - Source: https://sodra.lt/imokos/esu-mazosios-bendrijos-narys
 *
 * 2. Lėšos asmeniniams poreikiams (code 02) — from after-tax MB profit.
 *    - GPM: 15% flat
 *    - VSD: 13.83% on (amount × sodraMemberBasePercent)
 *    - PSD: 6.98% on (amount × sodraMemberBasePercent)
 *    - sodraMemberBasePercent: 50% (2024-2025), 90% from 2026-07-01
 *    - Gives stažas
 *    - Source: https://smapskaita.lt/mb-nario-mokesciai-2026-metais/
 *
 * Flow:
 * 1. Civil contract = MB expense → reduces MB taxable profit
 * 2. Pelno mokestis on remaining MB profit
 * 3. After-tax profit available for lėšos asmeniniams poreikiams
 * 4. Member withdrawal triggers GPM + VSD + PSD
 */
export interface OptimizerOptions {
  activityStartDate?: string;
}

export function calculateOptimizedTax(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  plan: WithdrawalPlan,
  options?: OptimizerOptions,
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

  // --- Step 1: Civil contract (code 77) — MB expense ---
  let civilContractAmount = 0;
  if (plan.civilContractEnabled && plan.civilContractAnnual > 0) {
    civilContractAmount = Math.min(plan.civilContractAnnual, mbProfit);

    // GPM: flat 15% (2024-2025) or progressive (2026+)
    const gpm = calculateProgressiveGPM(civilContractAmount, rates);
    // No Sodra on civil contract
    const totalTax = gpm;

    withdrawals.push({
      method: "civilContract",
      label: "Civilinė sutartis (code 77)",
      amount: civilContractAmount,
      gpm,
      gpmRate: rates.gpmCivilContract,
      vsd: 0,
      psd: 0,
      employerSodra: 0,
      totalTax,
      netAmount: r2(civilContractAmount - totalTax),
      stazasMonths: 0, // no stažas from civil contract
    });
  }

  // --- Step 2: Pelno mokestis ---
  const mbTaxableProfit = Math.max(0, mbProfit - civilContractAmount);
  const pelnoMokestisRate = getPelnoMokestisRate(
    year, totalIncome, rates, options?.activityStartDate,
  );
  const pelnoMokestis = r2(mbTaxableProfit * pelnoMokestisRate);
  const afterTaxProfit = r2(mbTaxableProfit - pelnoMokestis);

  // --- Step 3: Lėšos asmeniniams poreikiams (code 02) — for stažas ---
  let code02Amount = 0;
  if (plan.memberWithdrawalEnabled && afterTaxProfit > 0) {
    // If amount specified, use it. If 0, auto-calculate minimum for full stažas.
    const minForStazas = r2(Math.ceil(rates.minMonthlyWage / rates.sodraMemberBasePercent) * 12);
    const requested = plan.memberWithdrawalAnnual > 0
      ? plan.memberWithdrawalAnnual
      : minForStazas;
    code02Amount = Math.min(requested, afterTaxProfit);

    if (code02Amount > 0) {
      const sodraBase = r2(code02Amount * rates.sodraMemberBasePercent);
      const vsd = r2(Math.min(sodraBase, rates.sodraCeiling) * rates.vsdMember);
      const psd = r2(sodraBase * rates.psd);
      const gpm = r2(code02Amount * rates.gpmDividends);
      const totalTax = r2(gpm + vsd + psd);
      const monthlySodraBase = sodraBase / 12;
      const stazas = r2(Math.min(12, (monthlySodraBase / rates.minMonthlyWage) * 12));

      withdrawals.push({
        method: "memberWithdrawal",
        label: "Lėšos asmeniniams poreikiams (code 02)",
        amount: code02Amount,
        gpm,
        gpmRate: rates.gpmDividends,
        vsd,
        psd,
        employerSodra: 0,
        totalTax,
        netAmount: r2(code02Amount - totalTax),
        stazasMonths: Math.min(12, stazas),
      });
    }
  }

  // --- Step 4: Dividendai (pelno paskirstymas) — rest of after-tax profit ---
  const remainingAfterCode02 = r2(afterTaxProfit - code02Amount);
  if (plan.dividendsEnabled && remainingAfterCode02 > 0) {
    const gpm = r2(remainingAfterCode02 * rates.gpmDividends);

    withdrawals.push({
      method: "dividends",
      label: "Dividendai (pelno paskirstymas)",
      amount: remainingAfterCode02,
      gpm,
      gpmRate: rates.gpmDividends,
      vsd: 0,
      psd: 0,
      employerSodra: 0,
      totalTax: gpm,
      netAmount: r2(remainingAfterCode02 - gpm),
      stazasMonths: 0,
    });
  }

  // --- Totals ---
  const totalGpm = r2(withdrawals.reduce((s, w) => s + w.gpm, 0));
  const totalVsd = r2(withdrawals.reduce((s, w) => s + w.vsd, 0));
  const totalPsd = r2(withdrawals.reduce((s, w) => s + w.psd, 0));
  const totalEmployerSodra = 0;
  const totalTax = r2(totalGpm + totalVsd + totalPsd + pelnoMokestis);
  const totalNet = r2(withdrawals.reduce((s, w) => s + w.netAmount, 0));
  const stazasMonths = Math.min(12, r2(withdrawals.reduce((s, w) => s + w.stazasMonths, 0)));

  const totalWithdrawn = r2(withdrawals.reduce((s, w) => s + w.amount, 0));
  const remainingInMB = r2(afterTaxProfit - code02Amount - (plan.dividendsEnabled ? remainingAfterCode02 : 0));

  // Mandatory PSD from MMA if no Sodra at all
  let mandatoryPsd = 0;
  if (totalVsd === 0 && totalPsd === 0) {
    mandatoryPsd = r2(rates.minMonthlyWage * 12 * rates.psd);
  }

  return {
    year,
    totalIncome: r2(totalIncome),
    totalExpenses: r2(totalExpenses),
    mbProfit: r2(mbProfit),
    withdrawals,
    totalGpm,
    totalVsd,
    totalPsd: r2(totalPsd + mandatoryPsd),
    totalEmployerSodra,
    totalTax: r2(totalTax + mandatoryPsd),
    totalNet: r2(totalNet - mandatoryPsd),
    effectiveRate: totalWithdrawn > 0 ? r2((totalTax + mandatoryPsd) / totalWithdrawn) : 0,
    stazasMonths,
    vatWarning: civilContractAmount > rates.vatThreshold,
    remainingInMB,
    pelnoMokestis,
    pelnoMokestisRate,
  };
}

/**
 * Pelno mokestis rate.
 * Sources:
 * - https://www.vmi.lt/evmi/pelno-mokescio-pakeitimai-nuo-2026-m.
 * - https://versloerdve.lt/blog/verslo-pradzia-2026-0-pelno-mokestis-2-metai/
 */
function getPelnoMokestisRate(
  year: number,
  annualRevenue: number,
  rates: ReturnType<typeof getTaxRates>,
  activityStartDate?: string,
): number {
  // First N years at 0%
  if (activityStartDate) {
    const startYear = new Date(activityStartDate).getFullYear();
    if (year < startYear + rates.pelnoMokestisFirstYearCount) return rates.pelnoMokestisFirstYears;
  }
  // Small company: revenue < 300k (employee limit abolished from 2026)
  if (annualRevenue < 300000) return rates.pelnoMokestisSmall;
  return rates.pelnoMokestisStandard;
}

/**
 * Monthly Sodra breakdown.
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

    // Lėšos asmeniniams poreikiams: monthly Sodra
    if (plan.memberWithdrawalEnabled) {
      // Estimate: assume even distribution across 12 months
      // Actual amount depends on profit, but this gives indicative monthly
      const estimatedMonthlyBase = rates.minMonthlyWage; // conservative: at least MMA
      vsdBase = estimatedMonthlyBase * rates.sodraMemberBasePercent;
      vsd = r2(Math.min(vsdBase, rates.sodraCeiling / 12) * rates.vsdMember);
      psd = r2(vsdBase * rates.psd);
    }

    // Civil contract: no Sodra
    // (vsd and psd stay 0 for civil contract)

    // Mandatory PSD if nothing else
    if (vsd === 0 && psd === 0) {
      psd = r2(rates.minMonthlyWage * rates.psd);
    }

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
 * Obligations timeline with step-by-step instructions.
 */
export function generateObligations(
  year: number,
  plan: WithdrawalPlan,
  result: OptimizedTaxResult,
): Obligation[] {
  const obligations: Obligation[] = [];
  const hasMemberWithdrawal = plan.memberWithdrawalEnabled && result.totalVsd > 0;

  // Monthly Sodra for member withdrawal (code 02)
  if (hasMemberWithdrawal) {
    const monthlySodra = r2((result.totalVsd + result.totalPsd) / 12);
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "Sodra įmokos (code 02)",
        description: "VSD + PSD nuo lėšų asmeniniams poreikiams",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        amount: monthlySodra,
        recurring: "monthly",
        category: "sodra",
        steps: [
          { action: "Prisijunkite prie Sodra draudėjų portalo", portal: "https://draudejai.sodra.lt" },
          { action: "Patikrinkite apskaičiuotą VSD+PSD sumą" },
          { action: "Atlikite mokėjimą į Sodra sąskaitą iki 15 d.", account: "Gavėjas: Sodra" },
        ],
      });
    }
  }

  // Mandatory PSD even without member withdrawal
  if (!hasMemberWithdrawal) {
    const rates = getTaxRates(year);
    const monthlyPsd = r2(rates.minMonthlyWage * rates.psd);
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "PSD įmoka (privaloma)",
        description: "Minimali PSD nuo MMA",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        amount: monthlyPsd,
        recurring: "monthly",
        category: "sodra",
        steps: [
          { action: "Prisijunkite prie Sodra portalo", portal: "https://gyventojai.sodra.lt" },
          { action: "Atlikite PSD mokėjimą", account: "Gavėjas: Sodra. Privaloma PSD nuo MMA." },
        ],
      });
    }
  }

  // SAV reports (if Sodra is paid)
  if (hasMemberWithdrawal) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "SAV pranešimas",
        description: "Sodra mėnesinis pranešimas",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        recurring: "monthly",
        category: "declaration",
        steps: [
          { action: "Prisijunkite prie Sodra draudėjų portalo", portal: "https://draudejai.sodra.lt" },
          { action: 'Eikite "Pranešimai" \u2192 "SAV pranešimas"' },
          { action: "Užpildykite VSD/PSD bazę ir laikotarpį, pateikite" },
        ],
      });
    }
  }

  // GPM for civil contract (MB withholds)
  if (plan.civilContractEnabled) {
    for (let m = 1; m <= 12; m++) {
      obligations.push({
        name: "GPM deklaracija (FR0572)",
        description: "Mėnesinis GPM nuo civilinės sutarties",
        dueDate: `${year}-${String(m).padStart(2, "0")}-15`,
        recurring: "monthly",
        category: "gpm",
        steps: [
          { action: "Prisijunkite prie VMI EDS", portal: "https://deklaravimas.vmi.lt" },
          { action: "Pateikite FR0572 formą", form: "FR0572" },
          { action: "Perveskite GPM į VMI", account: "Gavėjas: VMI. Mokėjimo kodas: 1001 (GPM). MB yra mokesčio agentas." },
        ],
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
    steps: [
      { action: "Prisijunkite prie VMI EDS", portal: "https://deklaravimas.vmi.lt" },
      { action: "Pildykite GPM314 formą — visos pajamos ir mokesčiai", form: "GPM314" },
      { action: "Jei yra GPM skirtumas — sumokėkite arba laukite grąžinimo", account: "VMI, kodas 1001" },
    ],
  });

  // MB pelno mokestis
  obligations.push({
    name: "MB pelno mokesčio deklaracija (PLN204)",
    description: `Pelno mokestis: ${(result.pelnoMokestisRate * 100).toFixed(0)}%${result.pelnoMokestisRate === 0 ? " (lengvata)" : ""}`,
    dueDate: `${year + 1}-06-15`,
    amount: result.pelnoMokestis > 0 ? result.pelnoMokestis : undefined,
    recurring: "annual",
    category: "declaration",
    steps: [
      { action: "Prisijunkite prie VMI EDS", portal: "https://deklaravimas.vmi.lt" },
      { action: "Pildykite PLN204 formą", form: "PLN204" },
      { action: `Tarifas: ${(result.pelnoMokestisRate * 100).toFixed(0)}%. Bazė: MB pelnas po civilinės sutarties sąnaudų.` },
    ],
  });

  // Financial statements
  obligations.push({
    name: "Finansinė atskaitomybė",
    description: "Metinė ataskaita Registrų centrui",
    dueDate: `${year + 1}-06-30`,
    recurring: "annual",
    category: "declaration",
    steps: [
      { action: "Paruoškite MB balanso ir pelno/nuostolių ataskaitas" },
      { action: "Pateikite per Registrų centro portalą", portal: "https://jar.registrucentras.lt" },
    ],
  });

  return obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
