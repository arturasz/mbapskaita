import type { Obligation } from "../types";
import type { WisePayment } from "./import-wise";

export const obligationKey = (o: Pick<Obligation, "name" | "dueDate">) => `${o.name}:${o.dueDate}`;

const isSodra = (p: WisePayment) =>
  p.kind === "tax" && p.currency === "EUR" && /socialinio draudimo|sodra/i.test(p.counterparty);

/**
 * Monthly PSD obligations that the Wise statement proves as paid.
 * Sodra payments are pooled and applied to the earliest months first,
 * because one payment can cover several months (a debt payment).
 */
export function autoDonePsd(obligations: Obligation[], payments: WisePayment[]): Set<string> {
  let pool = payments.filter(isSodra).reduce((s, p) => s + p.amount, 0);
  const done = new Set<string>();
  const psd = obligations
    .filter((o) => o.name === "PSD įmoka (privaloma)" && o.amount)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const o of psd) {
    if (pool + 0.005 < o.amount!) break;
    pool -= o.amount!;
    done.add(obligationKey(o));
  }
  return done;
}
