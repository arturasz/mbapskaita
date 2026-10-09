import type { Currency, Dividend, Investment } from "../types";

/** One execution (fill) from the Trades section of an IBKR Flex Query CSV. */
export interface FlexTrade {
  id: string;
  symbol: string;
  date: string;
  side: "BUY" | "SELL";
  quantity: number; // always positive
  currency: Currency;
  proceeds: number; // absolute, in trade currency
  commission: number; // absolute
  commissionCurrency: Currency;
}

export interface FlexCashRow {
  id: string;
  symbol: string;
  date: string;
  type: string;
  amount: number;
  currency: Currency;
  description: string;
}

export interface FlexReport {
  trades: FlexTrade[];
  cash: FlexCashRow[];
}

export type ToEur = (amount: number, currency: Currency, date: string) => Promise<number>;

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const currencyOf = (raw: string): Currency => {
  const upper = raw.toUpperCase();
  return upper === "EUR" || upper === "USD" || upper === "GBP" ? upper : "USD";
};

const num = (raw: string | undefined) => parseFloat((raw ?? "").replace(/,/g, "")) || 0;
const isoDate = (raw: string) => raw.slice(0, 10); // "2026-04-02;07:05:41" -> "2026-04-02"

/**
 * Parse the CSV returned by the IBKR Flex Web Service. The file holds several
 * blocks, each starting with its own header row (trades, cash, open positions,
 * and an exchange-rate table that we ignore: ECB rates are used instead).
 */
export function parseFlexCsv(csv: string): FlexReport {
  const report: FlexReport = { trades: [], cash: [] };
  let header: string[] | null = null;

  for (const row of parseCSV(csv.replace(/^\uFEFF/, ""))) {
    if (row.length < 2) continue;
    if (row[0].trim() === "ClientAccountID" || (row[0] === "Date/Time" && row[1] === "FromCurrency")) {
      header = row;
      continue;
    }
    if (!header || row.length !== header.length) continue;
    const get = (name: string) => row[header!.indexOf(name)] ?? "";

    if (header.includes("Buy/Sell") && header.includes("TradeID")) {
      if (get("AssetClass") !== "STK") continue; // skip forex and anything but stocks/ETFs
      const side = get("Buy/Sell").toUpperCase();
      if (side !== "BUY" && side !== "SELL") continue;
      report.trades.push({
        id: get("TransactionID") || get("TradeID"),
        symbol: get("Symbol"),
        date: isoDate(get("TradeDate") || get("DateTime")),
        side,
        quantity: Math.abs(num(get("Quantity"))),
        currency: currencyOf(get("CurrencyPrimary")),
        proceeds: Math.abs(num(get("Proceeds"))),
        commission: Math.abs(num(get("IBCommission"))),
        commissionCurrency: currencyOf(get("IBCommissionCurrency") || get("CurrencyPrimary")),
      });
    } else if (header.includes("Type") && header.includes("Amount")) {
      report.cash.push({
        id: get("TransactionID") || `${get("Date/Time")}-${get("Type")}-${get("Symbol")}-${get("Amount")}`,
        symbol: get("Symbol"),
        date: isoDate(get("Date/Time")),
        type: get("Type"),
        amount: num(get("Amount")),
        currency: currencyOf(get("CurrencyPrimary")),
        description: get("Description"),
      });
    }
  }
  return report;
}

export interface SyncResult {
  investments: Investment[];
  added: number;
  closed: number;
  warnings: string[];
}

/**
 * Apply broker trades to the existing lots. Buys become lots; sells close the
 * oldest open lots first (FIFO), splitting a lot when only part of it is sold.
 * Re-running with the same trades changes nothing.
 */
export async function applyFlexTrades(
  existing: Investment[],
  trades: FlexTrade[],
  toEur: ToEur,
): Promise<SyncResult> {
  const lots = [...existing];
  const warnings: string[] = [];
  let added = 0;
  let closed = 0;

  const money = async (t: FlexTrade, sign: 1 | -1) => {
    // Cost = proceeds + commission, sale = proceeds - commission.
    const sameCurrency = t.commissionCurrency === t.currency;
    const original = t.proceeds + (sameCurrency ? sign * t.commission : 0);
    let eur = await toEur(t.proceeds, t.currency, t.date);
    if (t.commission) {
      eur += sign * (await toEur(t.commission, t.commissionCurrency, t.date));
    }
    return { original, eur };
  };

  const ordered = [...trades].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.side === "BUY" ? -1 : 1),
  );

  for (const t of ordered) {
    if (t.side === "BUY") {
      if (lots.some((l) => l.externalId === t.id)) continue;
      const cost = await money(t, 1);
      lots.push({
        id: crypto.randomUUID(),
        asset: t.symbol,
        purchaseDate: t.date,
        purchasePrice: cost.original,
        currency: t.currency,
        purchasePriceEur: cost.eur,
        quantity: t.quantity,
        broker: "IBKR",
        externalId: t.id,
      });
      added++;
      continue;
    }

    if (lots.some((l) => l.saleExternalId === t.id)) continue;
    const net = await money(t, -1);
    let remaining = t.quantity;
    const open = lots
      .filter((l) => !l.saleDate && l.asset === t.symbol && l.broker === "IBKR")
      .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

    for (const lot of open) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.quantity);
      const share = take / t.quantity;
      const ratio = take / lot.quantity;
      const sold: Investment = {
        ...lot,
        id: take === lot.quantity ? lot.id : crypto.randomUUID(),
        quantity: take,
        purchasePrice: lot.purchasePrice * ratio,
        purchasePriceEur: lot.purchasePriceEur * ratio,
        saleDate: t.date,
        salePrice: net.original * share,
        salePriceEur: net.eur * share,
        saleExternalId: t.id,
      };
      if (take === lot.quantity) {
        lots[lots.indexOf(lot)] = sold;
      } else {
        lots[lots.indexOf(lot)] = {
          ...lot,
          quantity: lot.quantity - take,
          purchasePrice: lot.purchasePrice - sold.purchasePrice,
          purchasePriceEur: lot.purchasePriceEur - sold.purchasePriceEur,
        };
        lots.push(sold);
      }
      remaining -= take;
      closed++;
    }
    if (remaining > 1e-9) {
      warnings.push(`${t.symbol} ${t.date}: sold ${t.quantity} but only ${t.quantity - remaining} found in open lots`);
    }
  }
  return { investments: lots, added, closed, warnings };
}

/** Dividends and withholding tax rows as records, converted to EUR. */
export async function flexDividends(cash: FlexCashRow[], toEur: ToEur): Promise<Dividend[]> {
  const out: Dividend[] = [];
  for (const row of cash) {
    const kind =
      row.type === "Dividends" || row.type === "Payment In Lieu Of Dividends"
        ? "dividend"
        : row.type === "Withholding Tax"
          ? "withholding"
          : null;
    if (!kind) continue;
    out.push({
      id: row.id,
      date: row.date,
      symbol: row.symbol,
      kind,
      amount: row.amount,
      currency: row.currency,
      amountEur: await toEur(row.amount, row.currency, row.date),
      description: row.description,
    });
  }
  return out;
}
