import { convertToEur } from "./currency";
import { parseFlexCsv, flexDividends } from "./import-ibkr-flex";
import { parseWiseApi } from "./import-wise";
import { useDividendStore } from "../stores/dividend-store";
import { useIncomeStore } from "../stores/income-store";
import { useInvestmentStore } from "../stores/investment-store";
import { useSyncStore } from "../stores/sync-store";
import { useWiseStore } from "../stores/wise-store";
import type { Currency, Income } from "../types";

// Each action returns a one-line result for the sync page and records the time.
// A thrown error means the sync failed and the time is not updated.

/** Import IBKR Flex CSV text (from the API or a manual file). */
export async function importFlexText(csv: string): Promise<string> {
  const report = parseFlexCsv(csv);
  const trades = await useInvestmentStore.getState().syncFlex(report.trades, convertToEur);
  const dividends = await flexDividends(report.cash, convertToEur);
  const newDividends = await useDividendStore.getState().importBatch(dividends);
  const parts = [`nauji pirkimai ${trades.added}`, `parduota ${trades.closed}`, `dividendai ${newDividends}`];
  if (trades.warnings.length) parts.push(`įspėjimai: ${trades.warnings.join("; ")}`);
  return parts.join(", ");
}

async function getOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res;
}

export async function syncIbkr(now = new Date()): Promise<string> {
  const message = await importFlexText(await (await getOk("/api/ibkr")).text());
  await useSyncStore.getState().mark("ibkr", now.toISOString());
  return message;
}

export async function syncWise(now = new Date(), days = 120): Promise<string> {
  const { statements } = await (await getOk(`/api/wise?days=${days}`)).json();
  const r = await useWiseStore.getState().importPayments(parseWiseApi(statements));
  await useSyncStore.getState().mark("wise", now.toISOString());
  return `pridėta ${r.added}, atnaujinta ${r.updated}`;
}

export interface InboxItem {
  invoiceNumber: string;
  fileId: string | null;
  issueDate: string;
  amount: number;
  currency: Currency;
  client: string;
  period?: string;
}

export async function fetchInbox(): Promise<InboxItem[]> {
  const res = await fetch("/api/inbox");
  return res.ok ? ((await res.json()) as { items: InboxItem[] }).items : [];
}

/** Move invoices that the browser add-on sent into the income list. */
export async function syncDeel(now = new Date()): Promise<string> {
  const { incomes, add, update, importBatch } = useIncomeStore.getState();
  const items = await fetchInbox();
  let added = 0;
  let linked = 0;
  for (const item of items) {
    const fileId = item.fileId ?? undefined;
    const existing = incomes.find((i) => i.invoiceNumber === item.invoiceNumber);
    if (existing) {
      if (fileId && !existing.fileId) {
        await update(existing.id, { fileId });
        linked++;
      }
    } else {
      const income: Income = {
        id: crypto.randomUUID(),
        date: item.issueDate,
        description: item.period ?? "Deel invoice",
        amount: item.amount,
        currency: item.currency,
        amountEur: await convertToEur(item.amount, item.currency, item.issueDate),
        category: "services",
        client: item.client,
        sourceCountry: "US",
        invoiceNumber: item.invoiceNumber,
        fileId,
      };
      const result = await importBatch([income]);
      if (result.added === 0) await add({ ...income, id: crypto.randomUUID() });
      added++;
    }
    await fetch(`/api/inbox?invoice=${encodeURIComponent(item.invoiceNumber)}`, { method: "DELETE" });
  }
  await useSyncStore.getState().mark("deel", now.toISOString());
  return `nauji ${added}, gavo PDF ${linked}`;
}
