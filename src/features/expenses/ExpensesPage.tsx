import { useEffect, useState, useCallback } from "react";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { FileImport, DirectoryImport } from "../../components/FileImport";
import { useExpenseStore } from "../../stores/expense-store";
import type { ImportResult } from "../../stores/expense-store";
import { parseExpenseCSV } from "../../lib/import-expenses";
import { expenseCategories } from "../../data/expense-categories";
import { convertToEur } from "../../lib/currency";
import type { Expense, Currency, ExpenseCategory } from "../../types";

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  currency: "EUR" as Currency,
  amountEur: "",
  category: "software" as ExpenseCategory,
  vatDeductible: true,
  vatAmount: "",
};

type FormState = typeof emptyForm;

function expenseToForm(expense: Expense): FormState {
  return {
    date: expense.date,
    description: expense.description,
    amount: String(expense.amount),
    currency: expense.currency,
    amountEur: String(expense.amountEur),
    category: expense.category,
    vatDeductible: expense.vatDeductible,
    vatAmount: expense.vatAmount != null ? String(expense.vatAmount) : "",
  };
}

export function ExpensesPage() {
  const { expenses, loaded, hydrate, add, importBatch, update, remove } =
    useExpenseStore();
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  const startEdit = (expense: Expense) => {
    setForm(expenseToForm(expense));
    setEditingId(expense.id);
    setShowForm(true);
  };

  const autoConvert = useCallback(
    async (amount: string, currency: Currency, date: string) => {
      if (currency === "EUR" || !amount || !date) return;
      setConverting(true);
      try {
        const eur = await convertToEur(Number(amount), currency, date);
        setForm((f) => ({ ...f, amountEur: String(eur) }));
      } catch {
        // silent — user can still type manually
      } finally {
        setConverting(false);
      }
    },
    [],
  );

  const showResult = (result: ImportResult, source: string) => {
    const parts = [`${source}: pridėta ${result.added}`];
    if (result.skipped > 0)
      parts.push(`praleista ${result.skipped} (dublikatai)`);
    setImportStatus(parts.join(", "));
    setTimeout(() => setImportStatus(null), 5000);
  };

  const handleCSVFiles = async (files: File[]) => {
    const allExpenses: Expense[] = [];

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) continue;
      const text = await file.text();
      const parsed = await parseExpenseCSV(text);
      allExpenses.push(...parsed);
    }

    if (allExpenses.length === 0) {
      setImportStatus("Nepavyko rasti išlaidų duomenų failuose");
      setTimeout(() => setImportStatus(null), 4000);
      return;
    }

    const result = await importBatch(allExpenses);
    showResult(result, `CSV (${files.length} failų)`);
  };

  const cancelForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Ar tikrai norite pašalinti šį išlaidų įrašą?")) return;
    await remove(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      date: form.date,
      description: form.description,
      amount: Number(form.amount),
      currency: form.currency,
      amountEur:
        form.currency === "EUR" ? Number(form.amount) : Number(form.amountEur),
      category: form.category,
      vatDeductible: form.vatDeductible,
      vatAmount: form.vatAmount ? Number(form.vatAmount) : undefined,
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
        <h1 className="text-2xl font-bold text-gray-900">Išlaidos</h1>
        <div className="flex flex-wrap items-center gap-3">
          <FileImport
            label="CSV failai"
            accept=".csv"
            onFiles={handleCSVFiles}
          />
          <DirectoryImport
            label="CSV katalogas"
            onFiles={handleCSVFiles}
            extensions={[".csv"]}
          />
          <button
            onClick={() => (showForm ? cancelForm() : setShowForm(true))}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? "Atšaukti" : "Pridėti išlaidą"}
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          {importStatus}
        </div>
      )}

      {showForm && (
        <Card title={editingId ? "Redaguoti išlaidą" : "Nauja išlaida"}>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
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
              <span className="text-sm font-medium text-gray-700">
                Aprašymas
              </span>
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Kategorija
              </span>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as ExpenseCategory,
                  })
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {expenseCategories.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.labelLt}
                  </option>
                ))}
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
                  Suma EUR{" "}
                  {converting && (
                    <span className="text-xs text-blue-500">
                      (konvertuojama...)
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={form.amountEur}
                  onChange={(e) =>
                    setForm({ ...form, amountEur: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  required
                />
                <span className="mt-1 text-xs text-gray-500">
                  ECB kursas pagal datą
                </span>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.vatDeductible}
                onChange={(e) =>
                  setForm({ ...form, vatDeductible: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                PVM atskaitomas
              </span>
            </label>
            {form.vatDeductible && (
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  PVM suma
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={form.vatAmount}
                  onChange={(e) =>
                    setForm({ ...form, vatAmount: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            )}
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
          data={expenses}
          keyFn={(e) => e.id}
          emptyMessage="Dar nėra išlaidų įrašų"
          columns={[
            { key: "date", header: "Data", render: (e) => e.date },
            {
              key: "description",
              header: "Aprašymas",
              render: (e) => e.description,
            },
            {
              key: "category",
              header: "Kategorija",
              render: (e) => (
                <Badge>
                  {expenseCategories.find((c) => c.key === e.category)
                    ?.labelLt ?? e.category}
                </Badge>
              ),
            },
            {
              key: "amount",
              header: "Suma",
              render: (e) =>
                e.currency !== "EUR"
                  ? `${e.amount.toFixed(2)} ${e.currency} (${e.amountEur.toFixed(2)} EUR)`
                  : `${e.amountEur.toFixed(2)} EUR`,
              className: "text-right",
            },
            {
              key: "vat",
              header: "PVM",
              render: (e) =>
                e.vatDeductible ? (
                  <Badge variant="success">
                    {e.vatAmount?.toFixed(2) ?? "—"}
                  </Badge>
                ) : (
                  <Badge variant="default">Ne</Badge>
                ),
            },
            {
              key: "actions",
              header: "",
              render: (e) => (
                <div className="flex gap-3">
                  <button
                    onClick={() => startEdit(e)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Redaguoti
                  </button>
                  <button
                    onClick={() => handleDelete(e.id)}
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
