import { describe, it, expect } from "vitest";
import { calculateInvestmentGains, totalInvestmentTax } from "./investments";
import type { Investment } from "../types";

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
