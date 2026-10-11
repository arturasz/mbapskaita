import type { Currency } from "../types";

const cache = new Map<string, number>();

// /api/ecbdata/* is proxied to data-api.ecb.europa.eu (avoids CORS): Vite in dev, Vercel rewrites in prod.
const ECB_SERIES = "/api/ecbdata/service/data/EXR/D";

/**
 * ECB reference rate (1 `from` = ? EUR) for a date.
 * Weekends and holidays have no fixing, so the last earlier fixing is used.
 */
export async function getExchangeRate(
  from: Currency,
  date: string,
): Promise<number> {
  if (from === "EUR") return 1;

  const key = `${from}:${date}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const start = new Date(Date.parse(date) - 10 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(
    `${ECB_SERIES}.${from}.EUR.SP00.A?startPeriod=${start}&endPeriod=${date}&format=csvdata`,
  );
  if (!res.ok) throw new Error(`Nepavyko gauti ${from}→EUR kurso ${date}`);

  const [header, ...rows] = (await res.text()).trim().split(/\r?\n/);
  const cols = header.split(",");
  const dateCol = cols.indexOf("TIME_PERIOD");
  const valueCol = cols.indexOf("OBS_VALUE");
  const last = rows
    .map((r) => r.split(","))
    .filter((c) => c[dateCol] <= date)
    .sort((a, b) => a[dateCol].localeCompare(b[dateCol]))
    .pop();
  const ecbRate = last ? parseFloat(last[valueCol]) : 0;
  if (!ecbRate) throw new Error(`Nepavyko gauti ${from}→EUR kurso ${date}`);

  // ECB quotes "1 EUR = X foreign"; we need the inverse.
  const rate = 1 / ecbRate;
  cache.set(key, rate);
  return rate;
}

/**
 * Convert an amount to EUR using ECB rate.
 */
export async function convertToEur(
  amount: number,
  from: Currency,
  date: string,
): Promise<number> {
  const rate = await getExchangeRate(from, date);
  return Math.round(amount * rate * 100) / 100;
}
