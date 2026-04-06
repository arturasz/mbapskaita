import type { Investment, Currency } from "../types";
import { convertToEur } from "./currency";

/**
 * Parse IBKR (Interactive Brokers) Activity Statement CSV.
 * Automatically converts USD amounts to EUR via ECB rates.
 *
 * IBKR CSV is section-based. We look for the "Trades" section.
 * Format:
 *   Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,
 *   Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,
 *   Realized P/L,MTM P/L,Code
 *
 * Data rows start with "Trades,Data,Order,Stocks,..."
 */
export async function parseIBKRActivityStatement(
  csvText: string,
): Promise<Investment[]> {
  const lines = csvText.trim().split("\n");
  const investments: Investment[] = [];

  let inTradesSection = false;
  let tradeHeaders: string[] = [];

  for (const line of lines) {
    const cols = parseCSVLine(line);

    // Detect Trades header row
    if (cols[0] === "Trades" && cols[1] === "Header") {
      inTradesSection = true;
      tradeHeaders = cols.map((h) => h.trim().toLowerCase());
      continue;
    }

    // Process trade data rows
    if (inTradesSection && cols[0] === "Trades" && cols[1] === "Data") {
      // Skip subtotals/totals
      if (cols[2]?.trim().toLowerCase() !== "order") continue;

      const get = (name: string) => {
        const idx = tradeHeaders.indexOf(name);
        return idx !== -1 ? cols[idx]?.trim() ?? "" : "";
      };

      // Only process stocks — skip Forex, Options, Bonds, etc.
      const assetCategory = get("asset category").toLowerCase();
      if (assetCategory && assetCategory !== "stocks") continue;

      const symbol = get("symbol");
      const currency = normalizeCurrency(get("currency"));
      const dateTime = get("date/time") || get("date");
      const quantity = parseFloat(get("quantity")?.replace(/,/g, "") ?? "0");
      const proceeds = parseFloat(get("proceeds")?.replace(/,/g, "") ?? "0");
      const commission = parseFloat(get("comm/fee")?.replace(/,/g, "") ?? "0");
      const basis = parseFloat(get("basis")?.replace(/,/g, "") ?? "0");

      const date = normalizeIBKRDate(dateTime);
      if (!date || !symbol) continue;

      const totalCost = Math.abs(proceeds) + Math.abs(commission);

      if (quantity > 0) {
        // Buy
        const purchasePriceEur = await convertToEur(totalCost, currency, date);
        investments.push({
          id: crypto.randomUUID(),
          asset: symbol,
          purchaseDate: date,
          purchasePrice: totalCost,
          currency,
          purchasePriceEur,
          quantity: Math.abs(quantity),
          broker: "IBKR",
        });
      } else if (quantity < 0) {
        // Sell
        const basisAbs = Math.abs(basis);
        const proceedsAbs = Math.abs(proceeds);
        const purchasePriceEur = await convertToEur(basisAbs, currency, date);
        const salePriceEur = await convertToEur(proceedsAbs, currency, date);

        investments.push({
          id: crypto.randomUUID(),
          asset: symbol,
          purchaseDate: date,
          purchasePrice: basisAbs,
          currency,
          purchasePriceEur,
          quantity: Math.abs(quantity),
          broker: "IBKR",
          saleDate: date,
          salePrice: proceedsAbs,
          salePriceEur,
        });
      }
    }

    // Exit trades section when a new section starts
    if (inTradesSection && cols[0] !== "Trades" && cols[0] !== "") {
      inTradesSection = false;
    }
  }

  return investments;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function normalizeCurrency(raw: string): Currency {
  const upper = raw.toUpperCase();
  if (upper === "EUR" || upper === "USD" || upper === "GBP") return upper;
  return "USD";
}

function normalizeIBKRDate(raw: string): string {
  // IBKR format: "2026-01-15, 10:30:00" or "2026-01-15" or "20260115"
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;

  return "";
}
