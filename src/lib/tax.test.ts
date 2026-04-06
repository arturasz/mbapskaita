import { describe, it, expect } from "vitest";
import { calculateAnnualTax, isInSodraDiscountPeriod } from "./tax";
import type { Income, Expense } from "../types";

function makeIncome(amountEur: number, date = "2026-06-15"): Income {
  return {
    id: "test",
    date,
    description: "Test",
    amount: amountEur,
    currency: "EUR",
    amountEur,
    category: "services",
    client: "Test Client",
    sourceCountry: "US",
  };
}

function makeExpense(amountEur: number, date = "2026-06-15"): Expense {
  return {
    id: "test-exp",
    date,
    description: "Test expense",
    amount: amountEur,
    currency: "EUR",
    amountEur,
    category: "software",
    vatDeductible: false,
  };
}

describe("calculateAnnualTax", () => {
  it("returns zero for no income", () => {
    const result = calculateAnnualTax([], [], 2026);
    expect(result.totalIncome).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.netIncome).toBe(0);
  });

  it("calculates correct tax on 50000 EUR income with no expenses", () => {
    const incomes = [makeIncome(50000)];
    const result = calculateAnnualTax(incomes, [], 2026);

    expect(result.totalIncome).toBe(50000);
    expect(result.totalExpenses).toBe(0);
    expect(result.taxableIncome).toBe(50000);

    // Sodra base = 50000 * 0.9 = 45000
    // VSD = 45000 * 0.1252 = 5634
    const expectedVsd = Math.round(45000 * 0.1252 * 100) / 100;
    expect(result.vsdAmount).toBe(expectedVsd);

    // PSD = 45000 * 0.0698 = 3141
    const expectedPsd = Math.round(45000 * 0.0698 * 100) / 100;
    expect(result.psdAmount).toBe(expectedPsd);

    // GPM = (50000 - VSD - PSD) * 0.15
    const expectedGpm =
      Math.round((50000 - expectedVsd - expectedPsd) * 0.15 * 100) / 100;
    expect(result.gpmAmount).toBe(expectedGpm);

    expect(result.totalTax).toBe(
      Math.round((expectedGpm + expectedVsd + expectedPsd) * 100) / 100,
    );
    expect(result.netIncome).toBe(
      Math.round((50000 - result.totalTax) * 100) / 100,
    );
  });

  it("deducts expenses from income", () => {
    const incomes = [makeIncome(60000)];
    const expenses = [makeExpense(10000)];
    const result = calculateAnnualTax(incomes, expenses, 2026);

    expect(result.totalIncome).toBe(60000);
    expect(result.totalExpenses).toBe(10000);
    expect(result.taxableIncome).toBe(50000);
  });

  it("filters by year correctly", () => {
    const incomes = [makeIncome(30000, "2026-03-01"), makeIncome(20000, "2025-12-01")];
    const result = calculateAnnualTax(incomes, [], 2026);

    expect(result.totalIncome).toBe(30000);
  });

  it("does not produce negative taxable income", () => {
    const incomes = [makeIncome(1000)];
    const expenses = [makeExpense(5000)];
    const result = calculateAnnualTax(incomes, expenses, 2026);

    expect(result.taxableIncome).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it("calculates a reasonable effective rate", () => {
    const incomes = [makeIncome(100000)];
    const result = calculateAnnualTax(incomes, [], 2026);

    // Effective rate should be between 25-35% for a 100k income
    expect(result.effectiveRate).toBeGreaterThan(0.25);
    expect(result.effectiveRate).toBeLessThan(0.35);
  });

  it("applies Sodra discount in first 2 years of activity", () => {
    const incomes = [makeIncome(50000)];
    const withDiscount = calculateAnnualTax(incomes, [], 2026, {
      activityStartDate: "2025-06-01",
    });
    const without = calculateAnnualTax(incomes, [], 2026);

    // VSD should be lower with discount (MMA base vs 90% profit)
    expect(withDiscount.vsdAmount).toBeLessThan(without.vsdAmount);
    // PSD stays the same (no discount on PSD)
    expect(withDiscount.psdAmount).toBe(without.psdAmount);
    // Total tax lower with discount
    expect(withDiscount.totalTax).toBeLessThan(without.totalTax);
  });

  it("does not apply Sodra discount after 2 years", () => {
    const incomes = [makeIncome(50000)];
    const result = calculateAnnualTax(incomes, [], 2026, {
      activityStartDate: "2024-01-01", // started 2024, discount covers 2024+2025 only
    });
    const without = calculateAnnualTax(incomes, [], 2026);

    expect(result.vsdAmount).toBe(without.vsdAmount);
  });
});

describe("isInSodraDiscountPeriod", () => {
  it("returns true for first 2 calendar years", () => {
    expect(isInSodraDiscountPeriod(2025, "2025-06-01")).toBe(true);
    expect(isInSodraDiscountPeriod(2026, "2025-06-01")).toBe(true);
  });

  it("returns false after 2 years", () => {
    expect(isInSodraDiscountPeriod(2027, "2025-06-01")).toBe(false);
  });

  it("returns false when no start date", () => {
    expect(isInSodraDiscountPeriod(2026)).toBe(false);
  });
});
