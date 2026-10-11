import { describe, it, expect } from "vitest";
import { brokerCashUsd, calculateInvestmentGains, investmentTotals, mbInvestmentIncome, totalInvestmentTax } from "./investments";
import type { Dividend, Investment } from "../types";

function makeInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    id: "inv-1",
    asset: "VWCE",
    purchaseDate: "2025-01-15",
    purchasePrice: 100,
    currency: "EUR",
    purchasePriceEur: 10000,
    quantity: 100,
    broker: "IBKR",
    ...overrides,
  };
}

describe("calculateInvestmentGains", () => {
  it("calculates gain on sold investment", () => {
    const investments = [
      makeInvestment({
        saleDate: "2026-06-15",
        salePrice: 15000,
        salePriceEur: 15000,
      }),
    ];

    const gains = calculateInvestmentGains(investments, 2026);
    expect(gains).toHaveLength(1);
    expect(gains[0].gain).toBe(5000);
    expect(gains[0].taxableGain).toBe(5000);
    expect(gains[0].gpmOnGain).toBe(750); // 5000 * 0.15
  });

  it("does not tax losses", () => {
    const investments = [
      makeInvestment({
        saleDate: "2026-06-15",
        salePrice: 8000,
        salePriceEur: 8000,
      }),
    ];

    const gains = calculateInvestmentGains(investments, 2026);
    expect(gains[0].gain).toBe(-2000);
    expect(gains[0].taxableGain).toBe(0);
    expect(gains[0].gpmOnGain).toBe(0);
  });

  it("ignores unsold investments", () => {
    const investments = [makeInvestment()];
    const gains = calculateInvestmentGains(investments, 2026);
    expect(gains).toHaveLength(0);
  });

  it("filters by sale year", () => {
    const investments = [
      makeInvestment({
        saleDate: "2025-12-01",
        salePrice: 12000,
        salePriceEur: 12000,
      }),
    ];

    const gains = calculateInvestmentGains(investments, 2026);
    expect(gains).toHaveLength(0);
  });

  it("calculates holding period", () => {
    const investments = [
      makeInvestment({
        purchaseDate: "2025-01-01",
        saleDate: "2026-07-01",
        salePriceEur: 12000,
      }),
    ];

    const gains = calculateInvestmentGains(investments, 2026);
    expect(gains[0].holdingPeriodDays).toBe(546); // ~1.5 years
  });
});

describe("totalInvestmentTax", () => {
  it("sums GPM across multiple gains", () => {
    const gains = [
      { investmentId: "1", asset: "A", purchasePriceEur: 1000, salePriceEur: 2000, gain: 1000, taxableGain: 1000, gpmOnGain: 150, holdingPeriodDays: 365 },
      { investmentId: "2", asset: "B", purchasePriceEur: 5000, salePriceEur: 8000, gain: 3000, taxableGain: 3000, gpmOnGain: 450, holdingPeriodDays: 200 },
    ];
    expect(totalInvestmentTax(gains)).toBe(600);
  });
});

describe("mbInvestmentIncome", () => {
  const lot = {
    id: "l", asset: "X", purchaseDate: "2026-05-01", purchasePrice: 100, currency: "USD",
    purchasePriceEur: 90, saleDate: "2026-07-01", salePrice: 150, salePriceEur: 130, quantity: 1, broker: "IBKR",
  } as Investment;
  const div = (date: string, amountEur: number) =>
    ({ id: date, date, symbol: "V", kind: "dividend", amount: amountEur, currency: "EUR", amountEur, description: "" }) as Dividend;

  it("adds realized gains and net dividends of the year", () => {
    const r = mbInvestmentIncome([lot], [div("2026-06-01", 50), div("2026-06-02", -7.5), div("2025-06-01", 999)], 2026);
    expect(r).toEqual({ realizedGain: 40, dividends: 42.5, total: 82.5 });
  });

  it("counts a loss as negative", () => {
    const r = mbInvestmentIncome([{ ...lot, salePriceEur: 80 }], [], 2026);
    expect(r.total).toBe(-10);
  });
});

describe("investmentTotals", () => {
  const lot = (o: Partial<Investment>) =>
    ({ id: "x", asset: "A", purchaseDate: "2026-05-01", purchasePrice: 100, currency: "USD", purchasePriceEur: 90, quantity: 1, broker: "IBKR", ...o }) as Investment;

  it("sums open lots per currency and in EUR, ignoring sold lots", () => {
    const t = investmentTotals([lot({}), lot({ purchasePrice: 50, purchasePriceEur: 45 }), lot({ saleDate: "2026-06-01", salePriceEur: 1 })]);
    expect(t.openCost).toEqual({ USD: 150 });
    expect(t.openCostEur).toBe(135);
    expect(t.openLots).toBe(2);
  });
});

describe("brokerCashUsd", () => {
  const lot = (o: Partial<Investment>) =>
    ({ id: "x", asset: "A", purchaseDate: "2026-05-01", purchasePrice: 1000, currency: "USD", purchasePriceEur: 900, quantity: 1, broker: "IBKR", ...o }) as Investment;
  const div = (amount: number) => ({ id: "d", date: "2026-06-01", symbol: "V", kind: "dividend", amount, currency: "USD", amountEur: amount, description: "" }) as Dividend;

  it("is deposits minus purchases plus proceeds and dividends", () => {
    const cash = brokerCashUsd(5000, [lot({}), lot({ saleDate: "2026-07-01", salePrice: 1200 })], [div(30), div(-4.5)]);
    expect(cash).toBe(5000 - 2000 + 1200 + 25.5);
  });
});
