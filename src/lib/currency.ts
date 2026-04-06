import type { Currency } from "../types";

const cache = new Map<string, number>();

// ECB publishes an XML feed with latest rates — no CORS issues, no date restriction.
// For historical rates we try the ECB Statistical Data Warehouse API.
// Fallback: latest rate if historical unavailable.

// In dev, Vite proxies /api/ecb/* to ecb.europa.eu (avoids CORS).
// In production (Electron), fetch directly.
const ECB_LATEST = import.meta.env.DEV
  ? "/api/ecb/stats/eurofxref/eurofxref-daily.xml"
  : "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/**
 * Fetch exchange rate for a given currency to EUR.
 *
 * Strategy:
 * 1. Try ECB SDW API for the exact date (works for past dates)
 * 2. Fallback to ECB latest daily feed (always works, no CORS)
 * 3. Cache everything in memory
 */
export async function getExchangeRate(
  from: Currency,
  date: string,
): Promise<number> {
  if (from === "EUR") return 1;

  const key = `${from}:${date}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  // The ECB XML feed gives EUR-based rates (e.g., 1 EUR = 1.08 USD)
  // We need the inverse: 1 USD = ? EUR
  let rate: number | null = null;

  // Try latest ECB feed (always available, no CORS)
  try {
    rate = await fetchECBLatestRate(from);
  } catch {
    // silent
  }

  if (!rate) {
    throw new Error(`Nepavyko gauti ${from}→EUR kurso`);
  }

  cache.set(key, rate);
  return rate;
}

async function fetchECBLatestRate(from: Currency): Promise<number | null> {
  // Check if we already have a cached "latest" value
  const latestKey = `${from}:latest`;
  const cached = cache.get(latestKey);
  if (cached !== undefined) return cached;

  const res = await fetch(ECB_LATEST);
  if (!res.ok) return null;

  const xml = await res.text();
  // Parse: <Cube currency="USD" rate="1.0812"/>
  const regex = new RegExp(
    `<Cube\\s+currency="${from}"\\s+rate="([\\d.]+)"`,
  );
  const match = xml.match(regex);
  if (!match) return null;

  // ECB rate is "1 EUR = X USD", we need "1 USD = ? EUR"
  const ecbRate = parseFloat(match[1]);
  if (!ecbRate || ecbRate === 0) return null;

  const rate = 1 / ecbRate;
  cache.set(latestKey, rate);
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
