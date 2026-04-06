import { describe, it, expect } from "vitest";
import { calculateQuarterlyVAT, isVATRegistrationRequired } from "./vat";
import type { Income, Expense, IncomeSourceCountry } from "../types";

function makeIncome(
  amountEur: number,
  date: string,
  sourceCountry: IncomeSourceCountry = "US",
): Income {
  return {
    id: `inc-${date}-${sourceCountry}`,
    date,
    description: "Test",
    amount: amountEur,
    currency: "EUR",
    amountEur,
    category: "services",
    client: "Client",
    sourceCountry,
  };
}

function makeExpense(
  amountEur: number,
  date: string,
  vatDeductible = true,
  vatAmount?: number,
): Expense {
  return {
    id: `exp-${date}`,
    date,
    description: "Test",
    amount: amountEur,
    currency: "EUR",
    amountEur,
    category: "software",
    vatDeductible,
    vatAmount,
  };
}

describe("calculateQuarterlyVAT", () => {
  it("does not charge VAT on non-LT income", () => {
    const incomes = [makeIncome(10000, "2026-01-15", "US")];
    const result = calculateQuarterlyVAT(incomes, [], 2026, 1);

    expect(result.salesAmount).toBe(10000);
    expect(result.vatOnSales).toBe(0);
  });

  it("charges VAT only on LT-source income", () => {
    const incomes = [
      makeIncome(10000, "2026-01-15", "LT"),
      makeIncome(20000, "2026-02-15", "US"),
    ];
    const result = calculateQuarterlyVAT(incomes, [], 2026, 1);

    expect(result.salesAmount).toBe(30000);
    expect(result.vatOnSales).toBe(Math.round(10000 * 0.21 * 100) / 100);
  });

  it("deducts VAT on purchases", () => {
    const incomes = [makeIncome(10000, "2026-01-15", "LT")];
    const expenses = [makeExpense(2000, "2026-02-10", true, 420)];
    const result = calculateQuarterlyVAT(incomes, expenses, 2026, 1);

    expect(result.vatOnSales).toBe(2100);
    expect(result.vatOnPurchases).toBe(420);
    expect(result.vatPayable).toBe(1680);
  });

  it("filters by quarter", () => {
    const incomes = [
      makeIncome(5000, "2026-03-20", "LT"),
      makeIncome(8000, "2026-04-10", "LT"), // Q2
    ];
    const result = calculateQuarterlyVAT(incomes, [], 2026, 1);
    expect(result.salesAmount).toBe(5000);
  });

  it("returns zero for empty quarter", () => {
    const result = calculateQuarterlyVAT([], [], 2026, 3);
    expect(result.salesAmount).toBe(0);
    expect(result.vatPayable).toBe(0);
  });
});

describe("isVATRegistrationRequired", () => {
  it("returns false for non-LT income even above threshold", () => {
    const incomes = [makeIncome(100000, "2026-06-01", "US")];
    expect(isVATRegistrationRequired(incomes, 2026)).toBe(false);
  });

  it("returns true when LT income exceeds threshold", () => {
    const incomes = [makeIncome(46000, "2026-06-01", "LT")];
    expect(isVATRegistrationRequired(incomes, 2026)).toBe(true);
  });

  it("returns false when LT income is below threshold", () => {
    const incomes = [
      makeIncome(30000, "2026-06-01", "LT"),
      makeIncome(50000, "2026-06-01", "US"),
    ];
    expect(isVATRegistrationRequired(incomes, 2026)).toBe(false);
  });
});
