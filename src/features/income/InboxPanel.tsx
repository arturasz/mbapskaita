import { useCallback, useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { useIncomeStore } from "../../stores/income-store";
import { convertToEur } from "../../lib/currency";
import type { Currency, Income } from "../../types";

interface InboxItem {
  invoiceNumber: string;
  fileId: string | null;
  issueDate: string; // ISO date
  amount: number;
  currency: Currency;
  client: string;
  period?: string;
}

/** Invoices sent by the browser add-on. Nothing reaches the income list until you import. */
export function InboxPanel() {
  const { incomes, add, update, importBatch } = useIncomeStore();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/inbox");
    if (res.ok) setItems(((await res.json()) as { items: InboxItem[] }).items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const importAll = async () => {
    setBusy(true);
    try {
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
          const amountEur = await convertToEur(item.amount, item.currency, item.issueDate);
          const income: Income = {
            id: crypto.randomUUID(),
            date: item.issueDate,
            description: item.period ?? "Deel invoice",
            amount: item.amount,
            currency: item.currency,
            amountEur,
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
        await fetch(`/api/inbox?invoice=${encodeURIComponent(item.invoiceNumber)}`, {
          method: "DELETE",
        });
      }
      setStatus(`Importuota: ${added} nauji, ${linked} gavo PDF`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return status ? (
      <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">{status}</div>
    ) : null;
  }

  return (
    <Card title={`Nauji Deel sąskaitos faktūros (${items.length})`}>
      <ul className="mb-3 text-sm text-gray-700">
        {items.map((i) => (
          <li key={i.invoiceNumber}>
            {i.issueDate} · {i.invoiceNumber} · {i.amount.toFixed(2)} {i.currency}
          </li>
        ))}
      </ul>
      <button
        onClick={importAll}
        disabled={busy}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Importuojama…" : "Importuoti"}
      </button>
    </Card>
  );
}
