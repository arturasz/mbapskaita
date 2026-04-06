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

describe("calculateAnnualTax — civil_contract mode", () => {
  it("returns zero for no income", () => {
    const result = calculateAnnualTax([], [], 2026);
    expect(result.totalIncome).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.netIncome).toBe(0);
  });

  it("calculates Sodra from full taxable income (civil contract)", () => {
    const incomes = [makeIncome(50000)];
    const result = calculateAnnualTax(incomes, [], 2026, { incomeMode: "civil_contract" });

    expect(result.taxableIncome).toBe(50000);

    // Sodra base = 50000 (full taxable income for civil contract)
    // VSD = 50000 * 0.1252 = 6260
    const expectedVsd = Math.round(50000 * 0.1252 * 100) / 100;
    expect(result.vsdAmount).toBe(expectedVsd);

    // PSD = 50000 * 0.0698 = 3490
    const expectedPsd = Math.round(50000 * 0.0698 * 100) / 100;
    expect(result.psdAmount).toBe(expectedPsd);

    // GPM = (50000 - VSD - PSD) * 0.15
    const expectedGpm =
      Math.round((50000 - expectedVsd - expectedPsd) * 0.15 * 100) / 100;
    expect(result.gpmAmount).toBe(expectedGpm);
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

  it("applies Sodra discount in first 2 years of activity", () => {
    const incomes = [makeIncome(50000)];
    const withDiscount = calculateAnnualTax(incomes, [], 2026, {
      activityStartDate: "2025-06-01",
      incomeMode: "civil_contract",
    });
    const without = calculateAnnualTax(incomes, [], 2026, {
      incomeMode: "civil_contract",
    });

    expect(withDiscount.vsdAmount).toBeLessThan(without.vsdAmount);
    expect(withDiscount.psdAmount).toBe(without.psdAmount);
    expect(withDiscount.totalTax).toBeLessThan(without.totalTax);
  });

  it("does not apply Sodra discount after 2 years", () => {
    const incomes = [makeIncome(50000)];
    const result = calculateAnnualTax(incomes, [], 2026, {
      activityStartDate: "2024-01-01",
    });
    const without = calculateAnnualTax(incomes, [], 2026);
    expect(result.vsdAmount).toBe(without.vsdAmount);
  });
});

describe("calculateAnnualTax — profit_withdrawal mode", () => {
  it("charges only GPM on full income (no Sodra deduction from base)", () => {
    const incomes = [makeIncome(50000)];
    const result = calculateAnnualTax(incomes, [], 2026, {
      incomeMode: "profit_withdrawal",
    });

    // GPM = 50000 * 0.15 = 7500
    expect(result.gpmAmount).toBe(7500);
    // VSD = 0 (no mandatory VSD for profit withdrawal)
    expect(result.vsdAmount).toBe(0);
    // PSD = MMA * 12 * 0.0698 (mandatory PSD from MMA)
    expect(result.psdAmount).toBeGreaterThan(0);
  });

  it("with voluntary Sodra, pays VSD+PSD from MMA base", () => {
    const incomes = [makeIncome(50000)];
    const result = calculateAnnualTax(incomes, [], 2026, {
      incomeMode: "profit_withdrawal",
      voluntarySodra: true,
    });

    // MMA 2026 = 1088, annual = 13056
    const mmaAnnual = 1088 * 12;
    const expectedVsd = Math.round(mmaAnnual * 0.1252 * 100) / 100;
    const expectedPsd = Math.round(mmaAnnual * 0.0698 * 100) / 100;

    expect(result.vsdAmount).toBe(expectedVsd);
    expect(result.psdAmount).toBe(expectedPsd);
    // GPM still on full income
    expect(result.gpmAmount).toBe(7500);
  });

  it("profit_withdrawal has lower total tax than civil_contract for same income", () => {
    const incomes = [makeIncome(80000)];
    const profit = calculateAnnualTax(incomes, [], 2026, { incomeMode: "profit_withdrawal" });
    const civil = calculateAnnualTax(incomes, [], 2026, { incomeMode: "civil_contract" });

    // Profit withdrawal should have lower total tax (no Sodra on full income)
    expect(profit.totalTax).toBeLessThan(civil.totalTax);
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
