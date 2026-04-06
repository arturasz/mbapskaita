import type { Investment, Currency } from "../types";
import { convertToEur } from "./currency";
import { extractPDFText } from "./pdf";

/**
 * Parse an IBKR Activity Statement PDF into Investment records.
 *
 * The IBKR PDF is tabular — we look for the "Trades" section,
 * then parse rows that contain stock trade data.
 *
 * Typical row pattern in extracted text:
 * "Stocks USD AAPL 2026-01-15, 10:30:00 10 180.00 ... -1800.00 -1.00 ..."
 */
export async function parseIBKRPDF(file: File): Promise<Investment[]> {
  const pages = await extractPDFText(file);
  const allText = pages.join("\n");
  return parseIBKRStatementText(allText);
}

export async function parseIBKRStatementText(
  text: string,
): Promise<Investment[]> {
  const investments: Investment[] = [];

  // Find the Trades section
  const tradesStart = text.search(/\bTrades\b/i);
  if (tradesStart === -1) return [];

  // Extract text from Trades section onwards
  const tradesText = text.slice(tradesStart);

  // Match trade rows: look for stock symbols with dates and quantities
  // IBKR PDF text often comes as: "Stocks USD SYMBOL DATE QTY PRICE ... PROCEEDS COMM BASIS ..."
  const tradePattern =
    /Stocks\s+(USD|EUR|GBP)\s+(\w+)\s+(\d{4}-\d{2}-\d{2})[\s,]*[\d:]*\s+([-\d,.]+)\s+([-\d,.]+)\s+([-\d,.]+)\s+([-\d,.]+)\s+([-\d,.]+)/g;

  let match;
  while ((match = tradePattern.exec(tradesText)) !== null) {
    const currency = match[1] as Currency;
    const symbol = match[2];
    const date = match[3];
    const quantity = parseNum(match[4]);
    const proceeds = parseNum(match[7]);
    const commission = parseNum(match[8]);

    if (!symbol || !date) continue;

    const totalCost = Math.abs(proceeds) + Math.abs(commission);

    if (quantity > 0) {
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
      const basisAbs = Math.abs(parseNum(match[8]) || totalCost);
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

  // Fallback: try simpler patterns if the structured one didn't match
  if (investments.length === 0) {
    return parseIBKRFallback(tradesText);
  }

  return investments;
}

/**
 * Fallback parser that looks for individual trade-like patterns
 * when the structured regex doesn't match the PDF layout.
 */
async function parseIBKRFallback(text: string): Promise<Investment[]> {
  const investments: Investment[] = [];

  // Look for lines with symbol + date + numbers
  const lines = text.split(/\n/);
  for (const line of lines) {
    // Match: SYMBOL DATE QTY PRICE (flexible spacing)
    const m = line.match(
      /\b([A-Z]{1,5})\b.*?(\d{4}-\d{2}-\d{2}).*?([-]?\d+(?:\.\d+)?)\s+([\d,.]+)/,
    );
    if (!m) continue;

    const symbol = m[1];
    const date = m[2];
    const quantity = parseNum(m[3]);
    const price = parseNum(m[4]);

    if (
      !symbol ||
      !date ||
      quantity === 0 ||
      symbol.length < 1 ||
      // Skip common non-symbol words
      ["USD", "EUR", "GBP", "NET", "FEE", "TAX"].includes(symbol)
    )
      continue;

    const totalCost = Math.abs(quantity * price);
    const currency: Currency = /USD/.test(line) ? "USD" : /GBP/.test(line) ? "GBP" : "EUR";
    const purchasePriceEur = await convertToEur(totalCost, currency, date);

    if (quantity > 0) {
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
    } else {
      const salePriceEur = await convertToEur(totalCost, currency, date);
      investments.push({
        id: crypto.randomUUID(),
        asset: symbol,
        purchaseDate: date,
        purchasePrice: totalCost,
        currency,
        purchasePriceEur,
        quantity: Math.abs(quantity),
        broker: "IBKR",
        saleDate: date,
        salePrice: totalCost,
        salePriceEur,
      });
    }
  }

  return investments;
}

function parseNum(raw: string): number {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}
