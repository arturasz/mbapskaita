import { useEffect, useState, useCallback } from "react";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { FileImport } from "../../components/FileImport";
import { useIncomeStore } from "../../stores/income-store";
import { parseDeelCSV } from "../../lib/import-deel";
import { convertToEur } from "../../lib/currency";
import type { Income, Currency, IncomeCategory, IncomeSourceCountry } from "../../types";

const sourceCountryLabels: Record<IncomeSourceCountry, string> = {
  LT: "Lietuva",
  US: "JAV",
  GB: "Jungtinė Karalystė",
  DE: "Vokietija",
  Other: "Kita",
};

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  currency: "EUR" as Currency,
  amountEur: "",
  category: "services" as IncomeCategory,
  client: "",
  sourceCountry: "US" as IncomeSourceCountry,
  invoiceNumber: "",
};

type FormState = typeof emptyForm;

function incomeToForm(income: Income): FormState {
  return {
    date: income.date,
    description: income.description,
    amount: String(income.amount),
    currency: income.currency,
    amountEur: String(income.amountEur),
    category: income.category,
    client: income.client,
    sourceCountry: income.sourceCountry,
    invoiceNumber: income.invoiceNumber ?? "",
  };
}

export function IncomePage() {
  const { incomes, loaded, hydrate, add, update, remove } = useIncomeStore();
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  const startEdit = (income: Income) => {
    setForm(incomeToForm(income));
    setEditingId(income.id);
    setShowForm(true);
  };

  const [importCount, setImportCount] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  const autoConvert = useCallback(
    async (amount: string, currency: Currency, date: string) => {
      if (currency === "EUR" || !amount || !date) return;
      setConverting(true);
      try {
        const eur = await convertToEur(Number(amount), currency, date);
        setForm((f) => ({ ...f, amountEur: String(eur) }));
      } catch {
        // silent — user can fill manually
      } finally {
        setConverting(false);
      }
    },
    [],
  );

  const handleDeelImport = async (csvText: string) => {
    try {
      const parsed = await parseDeelCSV(csvText);
      for (const income of parsed) {
        await add(income);
      }
      setImportCount(parsed.length);
      setTimeout(() => setImportCount(null), 4000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Importavimo klaida");
    }
  };

  const cancelForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      date: form.date,
      description: form.description,
      amount: Number(form.amount),
      currency: form.currency,
      amountEur: form.currency === "EUR" ? Number(form.amount) : Number(form.amountEur),
      category: form.category,
      client: form.client,
      sourceCountry: form.sourceCountry,
      invoiceNumber: form.invoiceNumber || undefined,
    };

    if (editingId) {
      await update(editingId, data);
    } else {
      await add({ id: crypto.randomUUID(), ...data });
    }
    cancelForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pajamos</h1>
        <div className="flex items-center gap-3">
          <FileImport label="Importuoti iš Deel" onImport={handleDeelImport} />
          <button
            onClick={() => (showForm ? cancelForm() : setShowForm(true))}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? "Atšaukti" : "Pridėti pajamas"}
          </button>
        </div>
      </div>

      {importCount !== null && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Importuota {importCount} įrašų iš Deel
        </div>
      )}

      {showForm && (
        <Card title={editingId ? "Redaguoti pajamas" : "Naujos pajamos"}>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Data</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => {
                  const date = e.target.value;
                  setForm({ ...form, date });
                  autoConvert(form.amount, form.currency, date);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Klientas</span>
              <input
                type="text"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Šaltinio šalis</span>
              <select
                value={form.sourceCountry}
                onChange={(e) => setForm({ ...form, sourceCountry: e.target.value as IncomeSourceCountry })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {Object.entries(sourceCountryLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Aprašymas</span>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Kategorija</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as IncomeCategory })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="services">Paslaugos</option>
                <option value="goods">Prekės</option>
                <option value="royalties">Autoriniai</option>
                <option value="other">Kita</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Suma</span>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => {
                  const amount = e.target.value;
                  setForm({ ...form, amount });
                  autoConvert(amount, form.currency, form.date);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Valiuta</span>
              <select
                value={form.currency}
                onChange={(e) => {
                  const currency = e.target.value as Currency;
                  setForm({ ...form, currency });
                  autoConvert(form.amount, currency, form.date);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            {form.currency !== "EUR" && (
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Suma EUR {converting && <span className="text-xs text-blue-500">(konvertuojama...)</span>}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={form.amountEur}
                  onChange={(e) => setForm({ ...form, amountEur: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  required
                />
                <span className="mt-1 text-xs text-gray-500">ECB kursas pagal datą</span>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Sąskaitos nr.</span>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-end gap-3 sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {editingId ? "Atnaujinti" : "Išsaugoti"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelForm}
                  className="rounded-md border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Atšaukti
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card>
        <Table
          data={incomes}
          keyFn={(i) => i.id}
          emptyMessage="Dar nėra pajamų įrašų"
          columns={[
            { key: "date", header: "Data", render: (i) => i.date },
            { key: "client", header: "Klientas", render: (i) => i.client },
            {
              key: "source",
              header: "Šaltinis",
              render: (i) => (
                <Badge variant={i.sourceCountry === "LT" ? "default" : "info"}>
                  {sourceCountryLabels[i.sourceCountry] ?? i.sourceCountry}
                </Badge>
              ),
            },
            { key: "description", header: "Aprašymas", render: (i) => i.description },
            {
              key: "category",
              header: "Kategorija",
              render: (i) => <Badge>{i.category}</Badge>,
            },
            {
              key: "amount",
              header: "Suma",
              render: (i) =>
                i.currency !== "EUR"
                  ? `${i.amount.toFixed(2)} ${i.currency} (${i.amountEur.toFixed(2)} EUR)`
                  : `${i.amountEur.toFixed(2)} EUR`,
              className: "text-right",
            },
            {
              key: "actions",
              header: "",
              render: (i) => (
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(i)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Redaguoti
                  </button>
                  <button
                    onClick={() => remove(i.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Pašalinti
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
