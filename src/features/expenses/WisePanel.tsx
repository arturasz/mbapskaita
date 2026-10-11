import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { FileImport } from "../../components/FileImport";
import { useExpenseStore } from "../../stores/expense-store";
import { useWiseStore } from "../../stores/wise-store";
import { findReceipt, parseWiseCsv } from "../../lib/import-wise";
import type { WiseKind } from "../../lib/import-wise";

const otherLabels: Record<Exclude<WiseKind, "card">, string> = {
  investment: "Pervedimai į IBKR",
  tax: "Mokesčiai / Sodra",
  conversion: "Valiutos keitimas",
  fee: "Wise komisiniai",
  other: "Kiti pervedimai",
};

export function WisePanel() {
  const { payments, decisions, loaded, hydrate, importPayments, ignore, unignore } = useWiseStore();
  const { expenses, loaded: expensesLoaded, hydrate: hydrateExpenses } = useExpenseStore();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) hydrate();
    if (!expensesLoaded) hydrateExpenses();
  }, [loaded, hydrate, expensesLoaded, hydrateExpenses]);

  const handleFiles = async (files: File[]) => {
    let added = 0;
    for (const file of files) {
      added += (await importPayments(parseWiseCsv(await file.text()))).added;
    }
    setStatus(added > 0 ? `Pridėta mokėjimų: ${added}` : "Naujų mokėjimų nerasta (reikia Wise CSV, ne ZIP)");
    setTimeout(() => setStatus(null), 5000);
  };

  const cards = payments.filter((p) => p.kind === "card");
  const matched = cards.filter((p) => findReceipt(p, expenses));
  const ignored = cards.filter((p) => !findReceipt(p, expenses) && decisions[p.id]);
  const missing = cards.filter((p) => !findReceipt(p, expenses) && !decisions[p.id]);

  const others = Object.entries(otherLabels)
    .map(([kind, label]) => {
      const rows = payments.filter((p) => p.kind === kind);
      const totals = new Map<string, number>();
      rows.forEach((p) => totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount));
      return { label, count: rows.length, totals: [...totals].map(([c, v]) => `${v.toFixed(2)} ${c}`).join(", ") };
    })
    .filter((o) => o.count > 0);

  return (
    <Card title="Wise išlaidos be čekių">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <FileImport label="Wise CSV" accept=".csv" onFiles={handleFiles} />
        {cards.length > 0 && (
          <span className="text-gray-600">
            Kortelės mokėjimai: {cards.length} · su čekiu {matched.length} · be čekio{" "}
            <b className={missing.length ? "text-red-600" : "text-green-700"}>{missing.length}</b> · praleista{" "}
            {ignored.length}
          </span>
        )}
      </div>
      {status && <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-800">{status}</div>}

      <Table
        data={missing}
        keyFn={(p) => p.id}
        emptyMessage={cards.length ? "Visi kortelės mokėjimai turi čekius" : "Importuokite Wise išrašą (CSV)"}
        columns={[
          { key: "date", header: "Data", render: (p) => p.date },
          { key: "who", header: "Gavėjas", render: (p) => p.counterparty },
          { key: "amount", header: "Suma", render: (p) => `${p.amount.toFixed(2)} ${p.currency}`, className: "text-right" },
          {
            key: "actions",
            header: "",
            render: (p) => (
              <button
                onClick={() => {
                  const note = window.prompt("Kodėl čekio nereikia? (pvz. asmeninė išlaida)");
                  if (note) ignore(p.id, note);
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Čekio nėra
              </button>
            ),
          },
        ]}
      />

      {ignored.length > 0 && (
        <details className="mt-4 text-sm text-gray-600">
          <summary className="cursor-pointer">Praleisti ({ignored.length})</summary>
          <ul className="mt-2 space-y-1">
            {ignored.map((p) => (
              <li key={p.id}>
                {p.date} · {p.counterparty} · {p.amount.toFixed(2)} {p.currency} — {decisions[p.id].note}{" "}
                <button onClick={() => unignore(p.id)} className="text-blue-600">
                  atšaukti
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {others.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-gray-600">
          {others.map((o) => (
            <li key={o.label}>
              {o.label}: {o.count} · {o.totals}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
