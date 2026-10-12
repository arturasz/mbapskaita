import { describe, expect, it } from "vitest";
import { doneFingerprint, encodeDone, guessVatKind, invoiceVatNote, pvm101ForMonth } from "./pvm101";
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

describe("VAT already on the invoice", () => {
  const foreign = pay("f", "2026-10-02", "Some SaaS Dublin");
  const withVat = { category: "software", vatAmount: 4.2 } as Expense;

  it("is local, so no PVM101 self-assessment", () => {
    expect(guessVatKind(foreign, withVat)).toBe("local");
  });

  it("stays a service when the invoice shows no VAT or the VAT is unknown", () => {
    expect(guessVatKind(foreign, { category: "software", vatAmount: 0 } as Expense)).toBe("service");
    expect(guessVatKind(foreign, { category: "software" } as Expense)).toBe("service");
  });

  it("drops the month out of PVM101", () => {
    const e = { id: "e", date: "2026-10-02", amount: 20, currency: "USD", amountEur: 17, category: "software", vatAmount: 3, fileId: "f" } as Expense;
    expect(pvm101ForMonth("2026-10", [foreign], [e], {}, {}, "2026-07-16").required).toBe(false);
  });

  it("explains the invoice VAT state", () => {
    expect(invoiceVatNote(undefined)).toBe("nėra čekio");
    expect(invoiceVatNote({} as Expense)).toBe("PVM sąskaitoje nežinomas");
    expect(invoiceVatNote({ vatAmount: 0 } as Expense)).toBe("PVM sąskaitoje nėra");
    expect(invoiceVatNote({ vatAmount: 3.71 } as Expense)).toBe("PVM sąskaitoje: 3.71");
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
