import type { Currency } from "../types";

const cache = new Map<string, number>();

/**
 * Fetch ECB exchange rate for a given date via Frankfurter API.
 * Returns the EUR amount for 1 unit of the source currency.
 *
 * Caches results in memory to avoid repeated requests for the same date/currency.
 * Falls back to the latest available rate if the exact date is a weekend/holiday.
 */
export async function getExchangeRate(
  from: Currency,
  date: string,
): Promise<number> {
  if (from === "EUR") return 1;

  const key = `${from}:${date}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const res = await fetch(
    `https://api.frankfurter.app/${date}?from=${from}&to=EUR`,
  );

  if (!res.ok) {
    throw new Error(`Nepavyko gauti valiutos kurso: ${res.status}`);
  }

  const data = await res.json();
  const rate: number = data.rates?.EUR;

  if (!rate) {
    throw new Error(`EUR kursas nerastas atsakyme`);
  }

  cache.set(key, rate);
  return rate;
}

/**
 * Convert an amount to EUR using the ECB rate for the given date.
 */
export async function convertToEur(
  amount: number,
  from: Currency,
  date: string,
): Promise<number> {
  const rate = await getExchangeRate(from, date);
  return Math.round(amount * rate * 100) / 100;
}
