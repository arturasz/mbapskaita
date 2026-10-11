import { describe, expect, it } from "vitest";
import { autoDonePsd, obligationKey } from "./obligation-status";
import type { Obligation } from "../types";
import type { WisePayment } from "./import-wise";

const psd = (month: number): Obligation => ({
  name: "PSD įmoka (privaloma)",
  description: "",
  dueDate: `2026-${String(month).padStart(2, "0")}-28`,
  amount: 80.48,
  recurring: "monthly",
  category: "sodra",
  steps: [],
});

const sodra = (amount: number, id = "t"): WisePayment => ({
  id,
  date: "2026-05-07",
  amount,
  currency: "EUR",
  counterparty: "VALSTYBINIO SOCIALINIO DRAUDIMO FONDO VALDYBA PRIE",
  kind: "tax",
});

const months = [1, 2, 3, 4, 5, 6].map(psd);

describe("autoDonePsd", () => {
  it("marks nothing without Sodra payments", () => {
    expect(autoDonePsd(months, []).size).toBe(0);
  });

  it("applies one payment to the earliest months it covers", () => {
    const done = autoDonePsd(months, [sodra(321.92)]);
    expect([...done]).toEqual(months.slice(0, 4).map(obligationKey));
  });

  it("pools several payments", () => {
    const done = autoDonePsd(months, [sodra(321.92, "a"), sodra(402.4, "b")]);
    expect(done.size).toBe(6);
  });

  it("ignores other payees", () => {
    const other: WisePayment = { ...sodra(500), counterparty: "Interactive Brokers", kind: "investment" };
    expect(autoDonePsd(months, [other]).size).toBe(0);
  });

  it("does not mark a month for a partial payment", () => {
    expect(autoDonePsd(months, [sodra(80)]).size).toBe(0);
  });
});
