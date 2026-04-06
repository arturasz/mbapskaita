import type { Investment, InvestmentGain } from "../types";
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
      const gpmOnGain = round2(taxableGain * rates.gpm);
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
