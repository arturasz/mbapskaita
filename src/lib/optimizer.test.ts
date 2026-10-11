import { describe, expect, it } from "vitest";
import { calculateOptimizedTax, generateObligations, pvm101Obligations } from "./optimizer";
import { getTaxRates } from "../data/tax-rates";
import type { Expense, Income, WithdrawalPlan } from "../types";

const income = (amountEur: number, date = "2026-05-10"): Income => ({
  id: crypto.randomUUID(),
  date,
  description: "",
  amount: amountEur,
  currency: "EUR",
  amountEur,
  category: "services",
  client: "Deel",
  sourceCountry: "US",
});

const expense = (amountEur: number, date = "2026-05-11"): Expense => ({
  id: crypto.randomUUID(),
  date,
  description: "",
  amount: amountEur,
  currency: "EUR",
  amountEur,
  category: "other",
  vatDeductible: false,
});

const none: WithdrawalPlan = {
  civilContractEnabled: false,
  civilContractAnnual: 0,
  memberWithdrawalEnabled: false,
  memberWithdrawalAnnual: 0,
  dividendsEnabled: false,
  withdrawAll: false,
  withdrawalTarget: 0,
};

const rates = getTaxRates(2026);
const mandatoryPsd = Math.round(rates.minMonthlyWage * 12 * rates.psd * 100) / 100;
const firstYear = { activityStartDate: "2026-01-07" };

describe("no withdrawals", () => {
  const r = calculateOptimizedTax([income(100_000)], [expense(5_000)], 2026, none, firstYear);

  it("profit is income minus expenses", () => {
    expect(r.totalIncome).toBe(100_000);
    expect(r.totalExpenses).toBe(5_000);
    expect(r.mbProfit).toBe(95_000);
  });

  it("only the mandatory PSD is owed", () => {
    expect(r.withdrawals).toEqual([]);
    expect(r.totalGpm).toBe(0);
    expect(r.totalPsd).toBe(mandatoryPsd);
    expect(r.totalTax).toBe(mandatoryPsd);
    expect(r.effectiveRate).toBe(0);
  });

  it("all profit stays in the MB", () => {
    expect(r.remainingInMB).toBe(95_000);
  });
});

describe("pelno mokestis", () => {
  it("is 0% in the first two years", () => {
    const r = calculateOptimizedTax([income(100_000)], [], 2026, none, firstYear);
    expect(r.pelnoMokestisRate).toBe(0);
    expect(r.pelnoMokestis).toBe(0);
  });

  it("applies the small-company rate after the exemption", () => {
    const r = calculateOptimizedTax([income(100_000)], [], 2026, none, { activityStartDate: "2023-01-01" });
    expect(r.pelnoMokestisRate).toBe(rates.pelnoMokestisSmall);
    expect(r.pelnoMokestis).toBeCloseTo(100_000 * rates.pelnoMokestisSmall, 2);
    expect(r.remainingInMB).toBeCloseTo(100_000 - 100_000 * rates.pelnoMokestisSmall, 2);
  });

  it("uses the standard rate above 300k revenue", () => {
    const r = calculateOptimizedTax([income(400_000)], [], 2026, none, { activityStartDate: "2023-01-01" });
    expect(r.pelnoMokestisRate).toBe(rates.pelnoMokestisStandard);
  });
});

describe("year filter", () => {
  it("ignores income and expenses from other years", () => {
    const r = calculateOptimizedTax([income(1_000, "2025-12-31"), income(2_000)], [expense(10, "2027-01-01")], 2026, none, firstYear);
    expect(r.totalIncome).toBe(2_000);
    expect(r.totalExpenses).toBe(0);
  });
});

describe("dividends", () => {
  it("taxes the after-tax profit at the dividend GPM rate with no Sodra", () => {
    const r = calculateOptimizedTax([income(100_000)], [], 2026, { ...none, dividendsEnabled: true }, firstYear);
    const [d] = r.withdrawals;
    expect(d.method).toBe("dividends");
    expect(d.amount).toBe(100_000);
    expect(d.gpm).toBeCloseTo(100_000 * rates.gpmDividends, 2);
    expect(d.vsd + d.psd).toBe(0);
    expect(r.remainingInMB).toBe(0);
  });
});

describe("code 02 withdrawal", () => {
  const plan = { ...none, memberWithdrawalEnabled: true, memberWithdrawalAnnual: 20_000 };
  const r = calculateOptimizedTax([income(100_000)], [], 2026, plan, firstYear);
  const [w] = r.withdrawals;

  it("charges GPM, VSD and PSD on the Sodra base", () => {
    const base = 20_000 * rates.sodraMemberBasePercent;
    expect(w.method).toBe("memberWithdrawal");
    expect(w.gpm).toBeCloseTo(20_000 * rates.gpmDividends, 2);
    expect(w.vsd).toBeCloseTo(base * rates.vsdMember, 2);
    expect(w.psd).toBeCloseTo(base * rates.psd, 2);
  });

  it("does not add the mandatory PSD on top", () => {
    expect(r.totalPsd).toBeCloseTo(w.psd, 2);
  });

  it("leaves the rest in the MB", () => {
    expect(r.remainingInMB).toBe(80_000);
  });

  it("never withdraws more than the profit", () => {
    const small = calculateOptimizedTax([income(1_000)], [], 2026, plan, firstYear);
    expect(small.withdrawals[0].amount).toBe(1_000);
  });
});

describe("civil contract (code 77)", () => {
  it("is an MB expense with GPM and no Sodra", () => {
    const plan = { ...none, civilContractEnabled: true, civilContractAnnual: 30_000 };
    const r = calculateOptimizedTax([income(100_000)], [], 2026, plan, { activityStartDate: "2023-01-01" });
    const [w] = r.withdrawals;
    expect(w.method).toBe("civilContract");
    expect(w.vsd + w.psd).toBe(0);
    expect(w.gpm).toBeGreaterThan(0);
    // pelno mokestis is charged on profit after the contract
    expect(r.pelnoMokestis).toBeCloseTo(70_000 * rates.pelnoMokestisSmall, 2);
  });
});

describe("generateObligations", () => {
  const result = calculateOptimizedTax([income(100_000)], [], 2026, none, firstYear);
  const obligations = generateObligations(2026, none, result);
  const psd = obligations.filter((o) => o.name === "PSD įmoka (privaloma)");

  it("lists 12 monthly PSD payments due on the last day of the month", () => {
    expect(psd).toHaveLength(12);
    expect(psd.map((o) => o.dueDate).slice(0, 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("uses the monthly minimum PSD", () => {
    expect(psd[0].amount).toBe(80.48);
  });

  it("shows payment code 322", () => {
    expect(psd[0].steps.some((s) => s.action.includes("322"))).toBe(true);
  });
});

describe("pvm101Obligations", () => {
  it("is empty without a registration date", () => {
    expect(pvm101Obligations(2026)).toEqual([]);
  });

  it("starts with the registration month and is due on the 25th of the next month", () => {
    const o = pvm101Obligations(2026, "2026-07-16");
    expect(o).toHaveLength(6);
    expect(o[0].dueDate).toBe("2026-08-25");
    expect(o[0].description).toContain("2026-07");
    expect(o[5].dueDate).toBe("2027-01-25");
  });
});
