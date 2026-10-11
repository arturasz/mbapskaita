import type { Dividend, Investment, InvestmentGain } from "../types";
import { getTaxRates } from "../data/tax-rates";

/**
 * Calculate capital gains tax on sold investments.
 * Lithuanian rules: GPM 15% on gains from sale of securities.
 * No special long-term holding exemption for standard securities.
 */
export function calculateInvestmentGains(
  investments: Investment[],
  year: number,
): InvestmentGain[] {
  const rates = getTaxRates(year);

  return investments
    .filter(
      (inv) =>
        inv.saleDate &&
        inv.saleDate.startsWith(String(year)) &&
        inv.salePriceEur !== undefined,
    )
    .map((inv) => {
      const gain = round2((inv.salePriceEur ?? 0) - inv.purchasePriceEur);
      const taxableGain = Math.max(0, gain);
      const gpmOnGain = round2(taxableGain * rates.gpmDividends);
      const holdingPeriodDays = inv.saleDate
        ? Math.floor(
            (new Date(inv.saleDate).getTime() -
              new Date(inv.purchaseDate).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      return {
        investmentId: inv.id,
        asset: inv.asset,
        purchasePriceEur: inv.purchasePriceEur,
        salePriceEur: inv.salePriceEur ?? 0,
        gain,
        taxableGain,
        gpmOnGain,
        holdingPeriodDays,
      };
    });
}

export function totalInvestmentTax(gains: InvestmentGain[]): number {
  return round2(gains.reduce((sum, g) => sum + g.gpmOnGain, 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Investment income of an MB. The broker account belongs to the company, so
 * realized gains and dividends are MB profit (taxed by pelno mokestis), not
 * the personal 15 % capital-gains regime.
 * UNVERIFIED: foreign withholding is treated as a reduction of the dividend.
 */
export function mbInvestmentIncome(
  investments: Investment[],
  dividends: Dividend[],
  year: number,
): { realizedGain: number; dividends: number; total: number } {
  const realizedGain = round2(
    calculateInvestmentGains(investments, year).reduce((s, g) => s + g.gain, 0),
  );
  const net = round2(
    dividends.filter((d) => d.date.startsWith(String(year))).reduce((s, d) => s + d.amountEur, 0),
  );
  return { realizedGain, dividends: net, total: round2(realizedGain + net) };
}
