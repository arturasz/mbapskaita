import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { Badge } from "../../components/Badge";
import { useExpenseStore } from "../../stores/expense-store";
import { expenseCategories } from "../../data/expense-categories";
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

export function ExpensesPage() {
  const { expenses, loaded, hydrate, add, remove } = useExpenseStore();
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const expense: Expense = {
      id: crypto.randomUUID(),
      date: form.date,
      description: form.description,
      amount: Number(form.amount),
      currency: form.currency,
      amountEur: form.currency === "EUR" ? Number(form.amount) : Number(form.amountEur),
      category: form.category,
      vatDeductible: form.vatDeductible,
      vatAmount: form.vatAmount ? Number(form.vatAmount) : undefined,
    };
    await add(expense);
    setForm(emptyForm);
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Išlaidos</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? "Atšaukti" : "Pridėti išlaidą"}
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Data</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
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
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
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
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Valiuta</span>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            {form.currency !== "EUR" && (
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Suma EUR</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.amountEur}
                  onChange={(e) => setForm({ ...form, amountEur: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.vatDeductible}
                onChange={(e) => setForm({ ...form, vatDeductible: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">PVM atskaitomas</span>
            </label>
            {form.vatDeductible && (
              <label className="block">
                <span className="text-sm font-medium text-gray-700">PVM suma</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.vatAmount}
                  onChange={(e) => setForm({ ...form, vatAmount: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            )}
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Išsaugoti
              </button>
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
            { key: "description", header: "Aprašymas", render: (e) => e.description },
            {
              key: "category",
              header: "Kategorija",
              render: (e) => (
                <Badge>
                  {expenseCategories.find((c) => c.key === e.category)?.labelLt ?? e.category}
                </Badge>
              ),
            },
            {
              key: "amount",
              header: "Suma",
              render: (e) => `${e.amountEur.toFixed(2)} EUR`,
              className: "text-right",
            },
            {
              key: "vat",
              header: "PVM",
              render: (e) =>
                e.vatDeductible ? (
                  <Badge variant="success">{e.vatAmount?.toFixed(2) ?? "—"}</Badge>
                ) : (
                  <Badge variant="default">Ne</Badge>
                ),
            },
            {
              key: "actions",
              header: "",
              render: (e) => (
                <button
                  onClick={() => remove(e.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Pašalinti
                </button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
