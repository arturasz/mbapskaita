import type {
  Income,
  Expense,
  Quarter,
  QuarterlyVATSummary,
} from "../types";
import { getTaxRates } from "../data/tax-rates";

/**
 * Whether this income is subject to Lithuanian VAT.
 *
 * B2B services to non-LT clients are not subject to LT VAT:
 * - EU B2B: reverse charge (place of supply = customer's country)
 * - Non-EU B2B: outside scope (PVMĮ 13 str.)
 *
 * Only LT-source income counts for VAT purposes.
 */
function isLTVatTaxable(income: Income): boolean {
  return income.sourceCountry === "LT";
}

export function calculateQuarterlyVAT(
  incomes: Income[],
  expenses: Expense[],
  year: number,
  quarter: Quarter,
): QuarterlyVATSummary {
  const rates = getTaxRates(year);
  const [startMonth, endMonth] = quarterMonthRange(quarter);

  const quarterIncomes = incomes.filter((i) => {
    const d = new Date(i.date);
    return d.getFullYear() === year && d.getMonth() >= startMonth && d.getMonth() <= endMonth;
  });

  const quarterExpenses = expenses.filter((e) => {
    const d = new Date(e.date);
    return (
      d.getFullYear() === year && d.getMonth() >= startMonth && d.getMonth() <= endMonth
    );
  });

  // Only LT-source income is VAT-taxable
  const vatTaxableIncomes = quarterIncomes.filter(isLTVatTaxable);

  const salesAmount = round2(
    quarterIncomes.reduce((sum, i) => sum + i.amountEur, 0),
  );
  const vatTaxableSales = round2(
    vatTaxableIncomes.reduce((sum, i) => sum + i.amountEur, 0),
  );
  const vatOnSales = round2(vatTaxableSales * rates.vatStandard);

  const purchaseAmount = round2(
    quarterExpenses
      .filter((e) => e.vatDeductible)
      .reduce((sum, e) => sum + e.amountEur, 0),
  );
  const vatOnPurchases = round2(
    quarterExpenses
      .filter((e) => e.vatDeductible && e.vatAmount !== undefined)
      .reduce((sum, e) => sum + (e.vatAmount ?? 0), 0),
  );

  const vatPayable = round2(vatOnSales - vatOnPurchases);

  return {
    year,
    quarter,
    salesAmount,
    vatOnSales,
    purchaseAmount,
    vatOnPurchases,
    vatPayable,
  };
}

/**
 * Mandatory VAT registration is based only on LT-taxable supplies.
 * B2B services to EU (reverse charge) and non-EU clients (outside scope)
 * do NOT count toward the 45 000 EUR threshold.
 */
export function isVATRegistrationRequired(
  incomes: Income[],
  year: number,
): boolean {
  const rates = getTaxRates(year);
  const ltTaxableIncome = incomes
    .filter((i) => i.date.startsWith(String(year)) && isLTVatTaxable(i))
    .reduce((sum, i) => sum + i.amountEur, 0);
  return ltTaxableIncome > rates.vatThreshold;
}

function quarterMonthRange(quarter: Quarter): [number, number] {
  const start = (quarter - 1) * 3;
  return [start, start + 2];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
