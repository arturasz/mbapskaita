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

export interface TaxRates {
  year: number;
  gpm: number; // GPM rate for civil contract / dividends (0.15)
  gpmEmployment: number; // GPM rate for employment salary (0.20)
  gpmDividends: number; // GPM on dividends (0.15)
  vsd: number; // VSD (pension) rate
  psd: number; // PSD (health) rate
  employerSodra: number; // employer Sodra contribution rate
  vatStandard: number; // standard VAT rate
  vatReduced: number; // reduced VAT rate
  vatThreshold: number; // annual EUR threshold for mandatory VAT registration
  minMonthlyWage: number; // MMA — minimum monthly wage
  averageMonthlyWage: number; // VDU — average monthly wage
  sodraCeiling: number; // Sodra contribution ceiling (VSD)
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
 * MB sole member cannot have darbo sutartis with their own MB.
 * Available methods:
 * - civilContract: civilinė sutartis — GPM 15%, VSD+PSD from payments, stažas
 * - dividends: pelno išėmimas — GPM 15%, no Sodra
 * - sodraSelf: register with Sodra as self-employed, pay VSD+PSD for stažas
 *   (independent of withdrawal method — can combine with dividends)
 */
export interface WithdrawalPlan {
  civilContractEnabled: boolean;
  civilContractAnnual: number; // annual amount via civil contract
  dividendsEnabled: boolean; // pelno išėmimas
  sodraSelfEnabled: boolean; // pay Sodra independently for stažas
  sodraSelfBase: number; // monthly base for voluntary Sodra (min MMA)
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
  method: "salary" | "civilContract" | "dividends";
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
  vatWarning: boolean; // civil contract exceeds 45k threshold
  remainingInMB: number; // profit not yet withdrawn
}

export interface Obligation {
  name: string;
  description: string;
  dueDate: string; // ISO date
  amount?: number;
  recurring: "monthly" | "quarterly" | "annual" | "once";
  category: "sodra" | "gpm" | "vat" | "declaration" | "other";
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
