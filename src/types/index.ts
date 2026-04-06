// --- Core enums ---

export type Currency = "EUR" | "USD" | "GBP";

export type IncomeCategory = "services" | "goods" | "royalties" | "other";

export type ExpenseCategory =
  | "office"
  | "equipment"
  | "software"
  | "travel"
  | "communication"
  | "banking"
  | "professional_services"
  | "other";

export type Quarter = 1 | 2 | 3 | 4;

export type VATScheme = "standard" | "margin" | "exempt";

// --- Core records ---

export type IncomeSourceCountry = "LT" | "US" | "GB" | "DE" | "Other";

export interface Income {
  id: string;
  date: string; // ISO date
  description: string;
  amount: number; // in original currency
  currency: Currency;
  amountEur: number; // converted to EUR
  category: IncomeCategory;
  client: string;
  sourceCountry: IncomeSourceCountry;
  invoiceNumber?: string;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  amountEur: number;
  category: ExpenseCategory;
  vatDeductible: boolean;
  vatAmount?: number;
}

export interface VATRecord {
  id: string;
  period: string; // "2026-Q1" format
  year: number;
  quarter: Quarter;
  salesAmount: number;
  purchaseAmount: number;
  vatOnSales: number;
  vatOnPurchases: number;
  vatPayable: number;
  filed: boolean;
  filedDate?: string;
}

export interface Investment {
  id: string;
  asset: string;
  purchaseDate: string;
  purchasePrice: number;
  currency: Currency;
  purchasePriceEur: number;
  saleDate?: string;
  salePrice?: number;
  salePriceEur?: number;
  quantity: number;
  broker: string;
}

// --- Tax configuration ---

export interface GPMBracket {
  upTo: number;
  rate: number;
}

export interface TaxRates {
  year: number;

  // GPM rates
  gpmCivilContract: number; // base GPM for civilinė sutartis (code 77)
  gpmDividends: number; // GPM on dividends / pelno išėmimas (flat 15%)
  gpmEmployment: number; // GPM for employment (not applicable to MB sole member)
  gpmProgressive: { brackets: GPMBracket[] } | null; // progressive GPM from 2026

  // Sodra for MB member — lėšos asmeniniams poreikiams (code 02)
  // Source: https://sodra.lt/imokos/esu-mazosios-bendrijos-narys
  vsdMember: number; // VSD rate for MB member (13.83%)
  psd: number; // PSD rate (6.98%)
  sodraMemberBasePercent: number; // % of withdrawn amount as Sodra base (50% or 90%)

  // Civilinė sutartis (code 77) — NO Sodra
  vsdCivilContract: number; // 0%
  psdCivilContract: number; // 0%

  // Pelno mokestis (corporate income tax)
  pelnoMokestisStandard: number;
  pelnoMokestisSmall: number; // small company reduced rate
  pelnoMokestisFirstYears: number; // 0% for first N years
  pelnoMokestisFirstYearCount: number; // how many years at 0%

  vatStandard: number;
  vatReduced: number;
  vatThreshold: number; // 45k EUR

  minMonthlyWage: number; // MMA
  averageMonthlyWage: number; // VDU (for Sodra calculations)
  sodraCeiling: number; // 43 VDU for self-employed
}

export interface FilingDeadline {
  name: string;
  description: string;
  month: number; // 1-12
  day: number;
  recurring: "monthly" | "quarterly" | "annual";
}

// --- Withdrawal plan ---

/**
 * How the MB member withdraws money. Multiple can be enabled.
 *
 * - salary: darbo sutartis — GPM 20%, full Sodra (employee+employer), stažas
 * - civilContract: civilinė sutartis — GPM 15%, VSD+PSD, stažas, but watch 45k VAT
 * - dividends: pelno išėmimas — GPM 15%, no Sodra (except mandatory PSD from MMA)
 */
/**
 * MB sole member withdrawal methods.
 * Source: https://sodra.lt/imokos/esu-mazosios-bendrijos-narys
 *
 * - civilContract (code 77): civilinė sutartis — GPM applies (progressive from 2026),
 *   NO VSD, NO PSD. Cheap but no stažas. This is an MB expense.
 *
 * - memberWithdrawal (code 02): lėšos asmeniniams poreikiams — GPM 15%,
 *   VSD 13.83% + PSD 6.98% on 50% of amount (90% from 2026-07).
 *   Gives stažas. Comes from after-tax profit.
 *
 * Both can be combined. MB sole member CANNOT have darbo sutartis.
 */
export interface WithdrawalPlan {
  civilContractEnabled: boolean;
  civilContractAnnual: number;
  memberWithdrawalEnabled: boolean; // lėšos asmeniniams poreikiams (code 02)
  withdrawAll: boolean;
  withdrawalTarget: number;
}

// --- App state ---

export interface Settings {
  defaultCurrency: Currency;
  vatRegistered: boolean;
  vatScheme: VATScheme;
  fiscalYear: number;
  memberName: string;
  mbName: string;
  activityStartDate?: string;
  withdrawalPlan: WithdrawalPlan;
  plannedMonthlyIncome: number; // expected monthly income in EUR (for projections)
}

// --- Tax calculation results ---

export interface AnnualTaxSummary {
  year: number;
  totalIncome: number;
  totalExpenses: number;
  taxableIncome: number;
  gpmAmount: number;
  vsdAmount: number;
  psdAmount: number;
  totalTax: number;
  effectiveRate: number;
  netIncome: number;
}

export interface WithdrawalBreakdown {
  method: "civilContract" | "memberWithdrawal";
  label: string;
  amount: number;
  gpm: number;
  gpmRate: number;
  vsd: number;
  psd: number;
  employerSodra: number;
  totalTax: number;
  netAmount: number;
  stazasMonths: number;
}

export interface OptimizedTaxResult {
  year: number;
  totalIncome: number;
  totalExpenses: number;
  mbProfit: number; // income - expenses
  withdrawals: WithdrawalBreakdown[];
  totalGpm: number;
  totalVsd: number;
  totalPsd: number;
  totalEmployerSodra: number;
  totalTax: number;
  totalNet: number;
  effectiveRate: number;
  stazasMonths: number;
  vatWarning: boolean;
  remainingInMB: number;
  pelnoMokestis: number; // corporate profit tax on undistributed profit
  pelnoMokestisRate: number; // 0% first year, 5% small company, 15% standard
}

export interface ObligationStep {
  action: string;
  portal?: string; // URL or portal name
  form?: string; // form code
  account?: string; // bank account / payment details
}

export interface Obligation {
  name: string;
  description: string;
  dueDate: string;
  amount?: number;
  recurring: "monthly" | "quarterly" | "annual" | "once";
  category: "sodra" | "gpm" | "vat" | "declaration" | "other";
  steps: ObligationStep[];
}

export interface QuarterlyVATSummary {
  year: number;
  quarter: Quarter;
  salesAmount: number;
  vatOnSales: number;
  purchaseAmount: number;
  vatOnPurchases: number;
  vatPayable: number;
}

export interface MonthlySodra {
  month: number; // 1-12
  vsdAmount: number;
  psdAmount: number;
  employerSodra: number;
  total: number;
  cumulative: number;
  stazasMonths: number;
  stazasCumulative: number;
}

export interface QuarterlyGPM {
  quarter: Quarter;
  incomeYTD: number;
  expensesYTD: number;
  taxableYTD: number;
  gpmYTD: number;
  gpmAdvance: number;
  previousAdvances: number;
}

export interface InvestmentGain {
  investmentId: string;
  asset: string;
  purchasePriceEur: number;
  salePriceEur: number;
  gain: number;
  taxableGain: number;
  gpmOnGain: number;
  holdingPeriodDays: number;
}

// --- Storage ---

export interface StoredData {
  incomes: Income[];
  expenses: Expense[];
  vatRecords: VATRecord[];
  investments: Investment[];
  settings: Settings;
}
