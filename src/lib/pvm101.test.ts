import { describe, expect, it } from "vitest";
import { doneFingerprint, encodeDone, guessVatKind, pvm101ForMonth } from "./pvm101";
import type { Expense } from "../types";
import type { WisePayment } from "./import-wise";

const pay = (id: string, date: string, counterparty: string, amount = 20, currency: "EUR" | "USD" = "USD"): WisePayment => ({
  id, date, amount, currency, counterparty, kind: "card",
});

const from = "2026-07-16";
const month = (period: string, payments: WisePayment[], expenses: Expense[] = [], overrides = {}) =>
  pvm101ForMonth(period, payments, expenses, {}, overrides, from);

describe("guessVatKind", () => {
  it("treats Lithuanian merchants as local", () => {
    expect(guessVatKind(pay("a", "2026-09-01", "Www.pigu.lt VILNIUS"))).toBe("local");
    expect(guessVatKind(pay("b", "2026-09-01", "Evp*Lemona.lt Kaunas"))).toBe("local");
  });

  it("treats foreign merchants as services, equipment as goods", () => {
    const p = pay("c", "2026-07-16", "Sp Aer Uk LONDON");
    expect(guessVatKind(p)).toBe("service");
    expect(guessVatKind(p, { category: "equipment" } as Expense)).toBe("goods");
  });
});

describe("pvm101ForMonth", () => {
  const openrouter = pay("o", "2026-10-11", "Openrouter, Inc +18482974487", 25.53);
  const expense = { id: "e", date: "2026-10-11", amount: 25.53, currency: "USD", amountEur: 22, category: "software", fileId: "f" } as Expense;

  it("is not required without foreign services", () => {
    const m = month("2026-09", [pay("l", "2026-09-27", "Evp*Lemona.lt Kaunas", 21.39, "EUR")]);
    expect(m.required).toBe(false);
    expect(m.fingerprint).toBe("");
  });

  it("is required with a foreign service and estimates PVM from the receipt EUR value", () => {
    const m = month("2026-10", [openrouter], [expense]);
    expect(m.required).toBe(true);
    expect(m.estimatedPvm).toBe(4.62);
  });

  it("ignores payments before the PVM registration", () => {
    expect(month("2026-07", [pay("x", "2026-07-10", "Github, Inc")]).required).toBe(false);
  });

  it("respects a manual override", () => {
    expect(month("2026-10", [openrouter], [], { o: "local" }).required).toBe(false);
  });

  it("changes the fingerprint when another purchase appears", () => {
    const a = month("2026-10", [openrouter]);
    const b = month("2026-10", [openrouter, pay("n", "2026-10-20", "Link.com* Nous")]);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe("done encoding", () => {
  it("round-trips the fingerprint", () => {
    expect(doneFingerprint(encodeDone("2026-10-12", "a,b"))).toBe("a,b");
    expect(doneFingerprint(encodeDone("2026-10-12", ""))).toBe("");
  });
});
