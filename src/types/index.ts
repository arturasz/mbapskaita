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
  gpm: number; // GPM rate (e.g. 0.15)
  gpmDividends: number; // GPM on dividends
  vsd: number; // VSD (pension) rate
  psd: number; // PSD (health) rate
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

// --- App state ---

export interface Settings {
  defaultCurrency: Currency;
  vatRegistered: boolean;
  vatScheme: VATScheme;
  fiscalYear: number;
  memberName: string;
  mbName: string;
  activityStartDate?: string; // ISO date — veiklos pradžia (Sodra lengvatos pirmus 2 m.)
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
  total: number;
  cumulative: number; // year-to-date total
}

export interface QuarterlyGPM {
  quarter: Quarter;
  incomeYTD: number;
  expensesYTD: number;
  taxableYTD: number;
  gpmYTD: number;
  gpmAdvance: number; // this quarter's advance payment
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
