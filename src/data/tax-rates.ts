import type { TaxRates } from "../types";

/**
 * Lithuanian tax rates by year for MB (mažoji bendrija) sole members.
 *
 * Sources:
 * - GPM: https://www.vmi.lt/evmi/5725
 * - GPM 2026 progressive: https://www.vmi.lt/evmi/gyventoju-pajamu-mokescio-pakeitimai-nuo-2026-m.
 * - Sodra MB narys: https://sodra.lt/imokos/esu-mazosios-bendrijos-narys
 * - Sodra tarifai 2026: https://sodra.lt/sodros-imoku-tarifai-taikomi-nuo-2026-m-sausio-1-d-savarankiskai-dirbantiems-asmenims
 * - MMA 2025: https://socmin.lrv.lt/lt/naujienos/patvirtinta-mma-nuo-2025-m-1038-eurai/
 * - MMA 2026: https://vdi.lrv.lt/lt/naujienos/nuo-2026-m-sausio-1-d-didesnis-minimalus-darbo-uzmokestis-1xW/
 * - VDU: https://www.tagidas.lt/savadai/9029/
 * - Pelno mokestis: https://www.vmi.lt/evmi/pelno-mokescio-pakeitimai-nuo-2026-m.
 * - Pelno mok. 0% 2 metai: https://versloerdve.lt/blog/verslo-pradzia-2026-0-pelno-mokestis-2-metai/
 * - PVM 45k riba: https://www.vmi.lt/evmi/kaip-skaiciuojama-45-000-euru-riba-del-prievoles-tapti-pvm-moketoju-
 * - MB mokesčiai 2026: https://www.mazojibendrija.lt/mb-mokesciai/
 * - SM apskaita: https://smapskaita.lt/mb-nario-mokesciai-2026-metais/
 */
export const taxRatesByYear: Record<number, TaxRates> = {
  2024: {
    year: 2024,
    // GPM: flat rates, no progressive
    gpmCivilContract: 0.15, // civilinė sutartis (code 77)
    gpmDividends: 0.15, // pelno išėmimas / dividendai
    gpmEmployment: 0.2, // darbo sutartis (not applicable to MB sole member)
    gpmProgressive: null, // no progressive in 2024

    // Sodra for MB member withdrawing lėšos asmeniniams poreikiams (code 02)
    // Source: https://sodra.lt/imokos/esu-mazosios-bendrijos-narys
    vsdMember: 0.1383, // VSD for MB member (code 02)
    psd: 0.0698, // PSD rate
    sodraMemberBasePercent: 0.5, // Sodra base = 50% of withdrawn amount

    // Civilinė sutartis (code 77): NO VSD, NO PSD
    // Source: https://sodra.lt/imokos/esu-mazosios-bendrijos-narys
    // "Civilinės sutarties pagrindu gaunamoms pajamoms VSD ir PSD netaikomos"
    vsdCivilContract: 0, // no VSD on civil contract
    psdCivilContract: 0, // no PSD on civil contract

    // Pelno mokestis
    // Source: https://www.vmi.lt/evmi/pelno-mokescio-pakeitimai-nuo-2026-m.
    pelnoMokestisStandard: 0.15,
    pelnoMokestisSmall: 0.05, // < 300k revenue, < 10 employees
    pelnoMokestisFirstYears: 0, // first year only in 2024
    pelnoMokestisFirstYearCount: 1, // 1 year at 0%

    vatStandard: 0.21,
    vatReduced: 0.09,
    vatThreshold: 45000,

    // MMA: https://socmin.lrv.lt/
    minMonthlyWage: 924,
    // VDU for Sodra: https://www.tagidas.lt/savadai/9029/
    averageMonthlyWage: 1902.7,
    // Sodra ceiling: 43 VDU for self-employed
    sodraCeiling: 1902.7 * 43, // 81,816.10
  },
  2025: {
    year: 2025,
    gpmCivilContract: 0.15,
    gpmDividends: 0.15,
    gpmEmployment: 0.2,
    gpmProgressive: null,

    vsdMember: 0.1383,
    psd: 0.0698,
    sodraMemberBasePercent: 0.5,
    vsdCivilContract: 0,
    psdCivilContract: 0,

    // Source: pelno mokestis raised from 2025
    pelnoMokestisStandard: 0.16,
    pelnoMokestisSmall: 0.06,
    pelnoMokestisFirstYears: 0,
    pelnoMokestisFirstYearCount: 1,

    vatStandard: 0.21,
    vatReduced: 0.09,
    vatThreshold: 45000,

    minMonthlyWage: 1038,
    averageMonthlyWage: 2108.88,
    sodraCeiling: 2108.88 * 43, // 90,681.84
  },
  2026: {
    year: 2026,
    // GPM 2026: progressive for civil contract (code 77)
    // Source: https://www.vmi.lt/evmi/gyventoju-pajamu-mokescio-pakeitimai-nuo-2026-m.
    gpmCivilContract: 0.15, // base rate (actual rate may be progressive)
    gpmDividends: 0.15, // dividends stay flat 15%
    gpmEmployment: 0.2,
    // Progressive GPM thresholds for 2026 (12/36/60 VDU boundaries)
    gpmProgressive: {
      brackets: [
        { upTo: 2312.15 * 12, rate: 0.15 }, // up to 12 VDU = 27,745.80
        { upTo: 2312.15 * 36, rate: 0.2 }, // 12-36 VDU = 83,237.40
        { upTo: 2312.15 * 60, rate: 0.25 }, // 36-60 VDU = 138,729.00
        { upTo: Infinity, rate: 0.32 }, // over 60 VDU
      ],
    },

    vsdMember: 0.1383,
    psd: 0.0698,
    // From 2026-07-01: base increases from 50% to 90%
    // Source: https://smapskaita.lt/mb-nario-mokesciai-2026-metais/
    sodraMemberBasePercent: 0.9, // using H2 rate as it applies to most of the year

    vsdCivilContract: 0,
    psdCivilContract: 0,

    // Pelno mokestis 2026
    // Source: https://www.vmi.lt/evmi/pelno-mokescio-pakeitimai-nuo-2026-m.
    pelnoMokestisStandard: 0.17,
    pelnoMokestisSmall: 0.07, // < 300k, employee limit abolished
    // Source: https://versloerdve.lt/blog/verslo-pradzia-2026-0-pelno-mokestis-2-metai/
    pelnoMokestisFirstYears: 0,
    pelnoMokestisFirstYearCount: 2, // extended to 2 years from 2026

    vatStandard: 0.21,
    vatReduced: 0.09,
    vatThreshold: 45000,

    // MMA 2026: https://vdi.lrv.lt/lt/naujienos/nuo-2026-m-sausio-1-d-didesnis-minimalus-darbo-uzmokestis-1xW/
    minMonthlyWage: 1153,
    // VDU 2026: https://www.tagidas.lt/savadai/9029/
    averageMonthlyWage: 2312.15,
    sodraCeiling: 2312.15 * 43, // 99,422.45
  },
};

export function getTaxRates(year: number): TaxRates {
  const rates = taxRatesByYear[year];
  if (!rates) {
    throw new Error(`Tax rates not available for year ${year}`);
  }
  return rates;
}

/**
 * Calculate progressive GPM for civil contract income (2026+).
 * Source: https://www.vmi.lt/evmi/gyventoju-pajamu-mokescio-pakeitimai-nuo-2026-m.
 */
export function calculateProgressiveGPM(
  annualIncome: number,
  rates: TaxRates,
): number {
  if (!rates.gpmProgressive) {
    return Math.round(annualIncome * rates.gpmCivilContract * 100) / 100;
  }

  let tax = 0;
  let remaining = annualIncome;
  let prevThreshold = 0;

  for (const bracket of rates.gpmProgressive.brackets) {
    const bracketSize = bracket.upTo - prevThreshold;
    const taxable = Math.min(remaining, bracketSize);
    tax += taxable * bracket.rate;
    remaining -= taxable;
    prevThreshold = bracket.upTo;
    if (remaining <= 0) break;
  }

  return Math.round(tax * 100) / 100;
}
