import type { Income, Expense, Investment, Settings, StoredData } from "../types";
import { storage } from "../storage";

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- CSV Export ---

export function exportIncomesCSV(incomes: Income[]) {
  const header = "Data,Klientas,Šalis,Aprašymas,Kategorija,Suma,Valiuta,Suma EUR,Sąskaitos Nr.";
  const rows = incomes.map((i) =>
    [
      i.date,
      csvEscape(i.client),
      i.sourceCountry,
      csvEscape(i.description),
      i.category,
      i.amount.toFixed(2),
      i.currency,
      i.amountEur.toFixed(2),
      i.invoiceNumber ?? "",
    ].join(","),
  );
  downloadFile([header, ...rows].join("\n"), "pajamos.csv", "text/csv");
}

export function exportExpensesCSV(expenses: Expense[]) {
  const header = "Data,Aprašymas,Kategorija,Suma,Valiuta,Suma EUR,PVM atskaitomas,PVM suma";
  const rows = expenses.map((e) =>
    [
      e.date,
      csvEscape(e.description),
      e.category,
      e.amount.toFixed(2),
      e.currency,
      e.amountEur.toFixed(2),
      e.vatDeductible ? "Taip" : "Ne",
      e.vatAmount?.toFixed(2) ?? "",
    ].join(","),
  );
  downloadFile([header, ...rows].join("\n"), "islaidos.csv", "text/csv");
}

export function exportInvestmentsCSV(investments: Investment[]) {
  const header = "Turtas,Brokeris,Pirkimo data,Kiekis,Pirkimo kaina,Valiuta,Pirkimo kaina EUR,Pardavimo data,Pardavimo kaina EUR";
  const rows = investments.map((inv) =>
    [
      inv.asset,
      inv.broker,
      inv.purchaseDate,
      inv.quantity,
      inv.purchasePrice.toFixed(2),
      inv.currency,
      inv.purchasePriceEur.toFixed(2),
      inv.saleDate ?? "",
      inv.salePriceEur?.toFixed(2) ?? "",
    ].join(","),
  );
  downloadFile([header, ...rows].join("\n"), "investicijos.csv", "text/csv");
}

// --- Full backup/restore ---

export async function exportFullBackup() {
  const incomes = (await storage.get<Income[]>("incomes")) ?? [];
  const expenses = (await storage.get<Expense[]>("expenses")) ?? [];
  const investments = (await storage.get<Investment[]>("investments")) ?? [];
  const settings = (await storage.get<Settings>("settings")) ?? ({} as Settings);

  const data: StoredData = { incomes, expenses, vatRecords: [], investments, settings };
  const json = JSON.stringify(data, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(json, `mb-apskaita-backup-${date}.json`, "application/json");
}

export async function importFullBackup(file: File): Promise<StoredData> {
  const text = await file.text();
  const data: StoredData = JSON.parse(text);

  if (!data.incomes || !data.expenses || !data.settings) {
    throw new Error("Netinkamas atsarginės kopijos formatas");
  }

  await storage.set("incomes", data.incomes);
  await storage.set("expenses", data.expenses);
  await storage.set("investments", data.investments ?? []);
  await storage.set("settings", data.settings);

  return data;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
