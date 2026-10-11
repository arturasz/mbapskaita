import type { Dividend, Income, Investment } from "../types";
import type { ToEur } from "./import-ibkr-flex";

/**
 * Rebuild EUR values with the ECB rate of each record's own date.
 * Earlier imports used today's rate for every record.
 */
export async function recalcIncomes(incomes: Income[], toEur: ToEur): Promise<Income[]> {
  return Promise.all(
    incomes.map(async (i) =>
      i.currency === "EUR" ? i : { ...i, amountEur: await toEur(i.amount, i.currency, i.date) },
    ),
  );
}

export async function recalcDividends(dividends: Dividend[], toEur: ToEur): Promise<Dividend[]> {
  return Promise.all(
    dividends.map(async (d) =>
      d.currency === "EUR" ? d : { ...d, amountEur: await toEur(d.amount, d.currency, d.date) },
    ),
  );
}

export async function recalcInvestments(lots: Investment[], toEur: ToEur): Promise<Investment[]> {
  return Promise.all(
    lots.map(async (l) => {
      if (l.currency === "EUR") return l;
      const purchasePriceEur = await toEur(l.purchasePrice, l.currency, l.purchaseDate);
      const sold = l.saleDate && l.salePrice !== undefined;
      return {
        ...l,
        purchasePriceEur,
        ...(sold ? { salePriceEur: await toEur(l.salePrice!, l.currency, l.saleDate!) } : {}),
      };
    }),
  );
}
