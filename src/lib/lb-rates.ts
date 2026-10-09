export interface LBRate {
  date: string;
  currency: string;
  rate: number; // units of currency per 1 EUR
}

export async function fetchRatesForCurrency(
  currency: string,
  year: number,
): Promise<LBRate[]> {
  const url =
    `/api/lb/FxRates.asmx/getFxRatesForCurrency?tp=EU&ccy=${currency}` +
    `&dtFrom=${year}-01-01&dtTo=${year}-12-31`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`LB.lt API klaida: ${res.status}`);

  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const rates: LBRate[] = [];

  const fxRates = xml.getElementsByTagName("FxRate");
  for (let i = 0; i < fxRates.length; i++) {
    const node = fxRates[i];
    const date = node.getElementsByTagName("Dt")[0]?.textContent ?? "";
    const ccyAmts = node.getElementsByTagName("CcyAmt");

    for (let j = 0; j < ccyAmts.length; j++) {
      const ccy = ccyAmts[j].getElementsByTagName("Ccy")[0]?.textContent ?? "";
      if (ccy === currency) {
        const amt = parseFloat(
          ccyAmts[j].getElementsByTagName("Amt")[0]?.textContent ?? "0",
        );
        rates.push({ date, currency: ccy, rate: amt });
      }
    }
  }

  return rates.sort((a, b) => a.date.localeCompare(b.date));
}

/** Find the rate on or before the given date. */
export function findRate(rates: LBRate[], date: string): LBRate | null {
  let best: LBRate | null = null;
  for (const r of rates) {
    if (r.date <= date) best = r;
    else break;
  }
  return best;
}
