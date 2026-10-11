import { describe, expect, it } from "vitest";
import { recalcDividends, recalcIncomes, recalcInvestments } from "./recalc-eur";
import type { Income, Investment } from "../types";

// Fake ECB: rate depends on the date, so a wrong date shows up in the result.
const toEur = async (amount: number, _from: string, date: string) => amount * (date < "2026-06-01" ? 0.5 : 0.8);

describe("recalc EUR", () => {
  it("uses each income's own date", async () => {
    const base = { description: "", category: "services", client: "", sourceCountry: "US", amountEur: 1 } as const;
    const out = await recalcIncomes(
      [
        { ...base, id: "a", date: "2026-05-01", amount: 100, currency: "USD" },
        { ...base, id: "b", date: "2026-07-01", amount: 100, currency: "USD" },
        { ...base, id: "c", date: "2026-07-01", amount: 100, currency: "EUR", amountEur: 100 },
      ] as Income[],
      toEur,
    );
    expect(out.map((i) => i.amountEur)).toEqual([50, 80, 100]);
  });

  it("recalculates lot purchase and sale separately", async () => {
    const lot = {
      id: "l", asset: "X", purchaseDate: "2026-05-01", purchasePrice: 100, currency: "USD",
      purchasePriceEur: 1, saleDate: "2026-07-01", salePrice: 200, salePriceEur: 1, quantity: 1, broker: "IBKR",
    } as Investment;
    const [out] = await recalcInvestments([lot], toEur);
    expect([out.purchasePriceEur, out.salePriceEur]).toEqual([50, 160]);
  });

  it("recalculates dividends", async () => {
    const [d] = await recalcDividends(
      [{ id: "d", date: "2026-07-01", symbol: "V", kind: "dividend", amount: 10, currency: "USD", amountEur: 1, description: "" }],
      toEur,
    );
    expect(d.amountEur).toBe(8);
  });
});
