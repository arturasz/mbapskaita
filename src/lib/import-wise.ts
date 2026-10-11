import type { Currency, Expense } from "../types";

export type WiseKind = "card" | "investment" | "tax" | "conversion" | "fee" | "other";

export interface WisePayment {
  id: string; // TransferWise ID, stable across exports
  date: string; // YYYY-MM-DD
  amount: number; // positive money out, in `currency`
  currency: Currency;
  counterparty: string;
  kind: WiseKind;
  // Card paid in another currency than the account: what the merchant charged.
  merchantAmount?: number;
  merchantCurrency?: Currency;
}

// Minimal RFC 4180 parser: Wise quotes fields that contain commas.
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const isoDate = (dmy: string) => {
  const [d, m, y] = dmy.split("-");
  return `${y}-${m}-${d}`;
};

function classify(r: Record<string, string>): WiseKind {
  const who = `${r["Merchant"]} ${r["Payee Name"]} ${r["Description"]}`.toLowerCase();
  if (r["Transaction Details Type"] === "CARD") return "card";
  if (r["Transaction Details Type"] === "CONVERSION") return "conversion";
  if (who.includes("interactive brokers")) return "investment";
  if (who.includes("socialinio draudimo") || who.includes("sodra") || who.includes("vmi") || who.includes("mokesči")) return "tax";
  if (who.includes("wise")) return "fee";
  return "other";
}

/** Money-out rows of a Wise statement CSV (one file per currency account). */
export function parseWiseCsv(text: string): WisePayment[] {
  const [header, ...body] = parseRows(text);
  if (!header || !header.includes("TransferWise ID")) return [];
  const out: WisePayment[] = [];
  for (const cells of body) {
    const r: Record<string, string> = {};
    header.forEach((h, i) => (r[h] = cells[i] ?? ""));
    const amount = Number(r["Amount"]);
    if (!(amount < 0) || r["Transaction Type"] !== "DEBIT") continue;
    const merchantAmount = Number(r["Exchange To Amount"]);
    const merchantCurrency = r["Exchange To"] as Currency;
    out.push({
      ...(merchantAmount > 0 && merchantCurrency
        ? { merchantAmount, merchantCurrency }
        : {}),
      id: r["TransferWise ID"],
      date: isoDate(r["Date"]),
      amount: Math.abs(amount),
      currency: r["Currency"] as Currency,
      counterparty: r["Merchant"] || r["Payee Name"] || r["Description"],
      kind: classify(r),
    });
  }
  return foldCardFees(out);
}

// Wise books a tiny separate fee row next to every card payment (and 1.13 USD
// next to every transfer). Those are not purchases, so mark them as fees.
function foldCardFees(rows: WisePayment[]): WisePayment[] {
  return rows.map((p) => {
    const isFee =
      p.kind === "card" &&
      p.amount < 1 &&
      rows.some(
        (o) => o !== p && o.kind === "card" && o.date === p.date && o.counterparty === p.counterparty && o.amount > p.amount,
      );
    return isFee ? { ...p, kind: "fee" } : p;
  });
}

const DAY = 86_400_000;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/** Expense with a stored receipt that plausibly belongs to this payment. */
export function findReceipt(p: WisePayment, expenses: Expense[]): Expense | undefined {
  return expenses.find((e) => {
    if (!e.fileId || daysApart(e.date, p.date) > 5) return false;
    if (p.merchantCurrency && e.currency === p.merchantCurrency) {
      return Math.abs(e.amount - p.merchantAmount!) < 0.015;
    }
    if (e.currency === p.currency) return Math.abs(e.amount - p.amount) < 0.015;
    // Receipt in another currency than the card charge: allow a 3 % FX/fee spread on EUR value.
    return p.currency === "EUR" && Math.abs(e.amountEur - p.amount) / p.amount < 0.03;
  });
}

/** Open payment that a freshly read receipt (date, amount, currency) belongs to. */
export function findPaymentForReceipt(
  r: { date: string; amount: number; currency: Currency },
  payments: WisePayment[],
): WisePayment | undefined {
  return payments.find((p) => {
    if (daysApart(r.date, p.date) > 5) return false;
    if (p.merchantCurrency === r.currency) return Math.abs(p.merchantAmount! - r.amount) < 0.015;
    return p.currency === r.currency && Math.abs(p.amount - r.amount) < 0.015;
  });
}
