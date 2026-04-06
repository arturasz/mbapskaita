import type { TaxRates } from "../types";

/**
 * Lithuanian tax rates by year for MB (mažoji bendrija) solo members.
 * GPM = Gyventojų pajamų mokestis (personal income tax)
 * VSD = Valstybinio socialinio draudimo (pension/social)
 * PSD = Privalomojo sveikatos draudimo (health insurance)
 */
export const taxRatesByYear: Record<number, TaxRates> = {
  2024: {
    year: 2024,
    gpm: 0.15,
    gpmDividends: 0.15,
    vsd: 0.1252,
    psd: 0.0698,
    vatStandard: 0.21,
    vatReduced: 0.09,
    vatThreshold: 45000,
    minMonthlyWage: 924,
    averageMonthlyWage: 1926.2,
    sodraCeiling: 108166.08, // 56.16 * VDU * 12 for VSD
  },
  2025: {
    year: 2025,
    gpm: 0.15,
    gpmDividends: 0.15,
    vsd: 0.1252,
    psd: 0.0698,
    vatStandard: 0.21,
    vatReduced: 0.09,
    vatThreshold: 45000,
    minMonthlyWage: 1038,
    averageMonthlyWage: 2100.0,
    sodraCeiling: 117936.0,
  },
  2026: {
    year: 2026,
    gpm: 0.15,
    gpmDividends: 0.15,
    vsd: 0.1252,
    psd: 0.0698,
    vatStandard: 0.21,
    vatReduced: 0.09,
    vatThreshold: 45000,
    minMonthlyWage: 1088,
    averageMonthlyWage: 2200.0,
    sodraCeiling: 123552.0,
  },
};

export function getTaxRates(year: number): TaxRates {
  const rates = taxRatesByYear[year];
  if (!rates) {
    throw new Error(`Tax rates not available for year ${year}`);
  }
  return rates;
}
