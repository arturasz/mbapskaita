import type { Expense } from "../types";
import type { WisePayment } from "./import-wise";
import { findReceipt } from "./import-wise";
import { getTaxRates } from "../data/tax-rates";

/**
 * SVS payers file PVM101 only for a month with services bought from abroad
 * (Lithuanian PVM is then self-assessed), among other triggers VMI lists.
 * Source: VMI notice Mr-PRI-183159. Goods and local purchases do not trigger it here.
 */
export type VatKind = "service" | "goods" | "local";

const LT_MERCHANT = /\.lt\b|vilnius|kaunas|klaip[eė]d|šiauli|siauli|panev[eė]ž|panevez|alytus|\blt\b/i;
const GOODS_CATEGORIES = new Set(["equipment", "office"]);

export function receiptFor(
  p: WisePayment,
  expenses: Expense[],
  linkedExpenseId?: string,
): Expense | undefined {
  return (linkedExpenseId && expenses.find((e) => e.id === linkedExpenseId)) || findReceipt(p, expenses);
}

/** Text for the receipt's VAT line: charged, none, or unknown (no receipt or not read). */
export function invoiceVatNote(expense?: Expense): string {
  if (!expense) return "nėra čekio";
  if (expense.vatAmount === undefined) return "PVM sąskaitoje nežinomas";
  return expense.vatAmount > 0 ? `PVM sąskaitoje: ${expense.vatAmount.toFixed(2)}` : "PVM sąskaitoje nėra";
}

/** Best guess; the user can override it per payment. */
export function guessVatKind(p: WisePayment, expense?: Expense): VatKind {
  if (LT_MERCHANT.test(p.counterparty)) return "local";
  // The supplier already charged VAT on the invoice, so there is nothing to self-assess.
  if (expense?.vatAmount && expense.vatAmount > 0) return "local";
  if (expense && GOODS_CATEGORIES.has(expense.category)) return "goods";
  return "service";
}

export interface Pvm101Month {
  period: string; // YYYY-MM
  required: boolean;
  triggers: { payment: WisePayment; eur?: number }[];
  estimatedPvm?: number; // 21 % of the known EUR values
  fingerprint: string; // changes when the set of triggering payments changes
}

export function pvm101ForMonth(
  period: string,
  payments: WisePayment[],
  expenses: Expense[],
  links: Record<string, string>, // payment id -> linked expense id
  overrides: Record<string, VatKind>,
  registeredFrom: string,
): Pvm101Month {
  const triggers = payments
    .filter((p) => p.kind === "card" && p.date.startsWith(period) && p.date >= registeredFrom)
    .filter((p) => {
      const expense = receiptFor(p, expenses, links[p.id]);
      return (overrides[p.id] ?? guessVatKind(p, expense)) === "service";
    })
    .map((payment) => {
      const expense = receiptFor(payment, expenses, links[payment.id]);
      const eur = payment.currency === "EUR" ? payment.amount : expense?.amountEur;
      return { payment, eur };
    });

  const known = triggers.filter((t) => t.eur !== undefined);
  const rate = getTaxRates(Number(period.slice(0, 4))).vatStandard;
  return {
    period,
    required: triggers.length > 0,
    triggers,
    estimatedPvm: known.length
      ? Math.round(known.reduce((s, t) => s + t.eur!, 0) * rate * 100) / 100
      : undefined,
    fingerprint: triggers.map((t) => t.payment.id).sort().join(","),
  };
}

// A manual "done" is stored as "<date>|<fingerprint>" so new purchases reopen it.
export const encodeDone = (date: string, fingerprint: string) => `${date}|${fingerprint}`;
export const doneFingerprint = (value: string) => value.slice(value.indexOf("|") + 1);
