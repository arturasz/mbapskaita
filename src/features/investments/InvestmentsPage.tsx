import { useEffect, useState, useMemo } from "react";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { StatCard } from "../../components/StatCard";
import { FileImport } from "../../components/FileImport";
import { useInvestmentStore } from "../../stores/investment-store";
import { useSettingsStore } from "../../stores/settings-store";
import { calculateInvestmentGains, totalInvestmentTax } from "../../lib/investments";
import { parseIBKRActivityStatement } from "../../lib/import-ibkr";
import type { Investment, Currency } from "../../types";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

const emptyForm = {
  asset: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePrice: "",
  currency: "EUR" as Currency,
  purchasePriceEur: "",
  quantity: "1",
  broker: "",
  saleDate: "",
  salePrice: "",
  salePriceEur: "",
};

export function InvestmentsPage() {
  const { investments, loaded, hydrate, add, remove } = useInvestmentStore();
  const { settings, loaded: sl, hydrate: hs } = useSettingsStore();
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!loaded) hydrate();
    if (!sl) hs();
  }, [loaded, sl, hydrate, hs]);

  const year = settings.fiscalYear;
  const gains = useMemo(
    () => calculateInvestmentGains(investments, year),
    [investments, year],
  );
  const tax = useMemo(() => totalInvestmentTax(gains), [gains]);

  const [importCount, setImportCount] = useState<number | null>(null);

  const handleIBKRImport = async (csvText: string) => {
    try {
      const parsed = await parseIBKRActivityStatement(csvText);
      for (const inv of parsed) {
        await add(inv);
      }
      setImportCount(parsed.length);
      setTimeout(() => setImportCount(null), 4000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Importavimo klaida");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv: Investment = {
      id: crypto.randomUUID(),
      asset: form.asset,
      purchaseDate: form.purchaseDate,
      purchasePrice: Number(form.purchasePrice),
      currency: form.currency,
      purchasePriceEur:
        form.currency === "EUR"
          ? Number(form.purchasePrice)
          : Number(form.purchasePriceEur),
      quantity: Number(form.quantity),
      broker: form.broker,
      saleDate: form.saleDate || undefined,
      salePrice: form.salePrice ? Number(form.salePrice) : undefined,
      salePriceEur: form.salePriceEur
        ? Number(form.salePriceEur)
        : form.salePrice && form.currency === "EUR"
          ? Number(form.salePrice)
          : undefined,
    };
    await add(inv);
    setForm(emptyForm);
    setShowForm(false);
  };

  if (!loaded || !sl) return <p className="text-gray-500">Kraunama...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Investicijos ({year})</h1>
        <div className="flex items-center gap-3">
          <FileImport label="Importuoti iš IBKR" onImport={handleIBKRImport} />
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? "Atšaukti" : "Pridėti investiciją"}
          </button>
        </div>
      </div>

      {importCount !== null && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Importuota {importCount} sandorių iš IBKR
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Realizuotas pelnas" value={fmt(gains.reduce((s, g) => s + g.gain, 0))} />
        <StatCard label="GPM nuo investicijų" value={fmt(tax)} />
        <StatCard label="Pozicijų" value={String(investments.length)} />
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Turtas</span>
              <input
                type="text"
                value={form.asset}
                onChange={(e) => setForm({ ...form, asset: e.target.value })}
                placeholder="pvz. VWCE"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Brokeris</span>
              <input
                type="text"
                value={form.broker}
                onChange={(e) => setForm({ ...form, broker: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Pirkimo data</span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Kiekis</span>
              <input
                type="number"
                step="0.0001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Pirkimo kaina</span>
              <input
                type="number"
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
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
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Pardavimo data</span>
              <input
                type="date"
                value={form.saleDate}
                onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Pardavimo kaina (EUR)</span>
              <input
                type="number"
                step="0.01"
                value={form.salePriceEur}
                onChange={(e) => setForm({ ...form, salePriceEur: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
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

      <Card title="Investicijos">
        <Table
          data={investments}
          keyFn={(inv) => inv.id}
          emptyMessage="Dar nėra investicijų"
          columns={[
            { key: "asset", header: "Turtas", render: (inv) => inv.asset },
            { key: "broker", header: "Brokeris", render: (inv) => inv.broker },
            { key: "date", header: "Pirkimo data", render: (inv) => inv.purchaseDate },
            { key: "qty", header: "Kiekis", render: (inv) => String(inv.quantity) },
            {
              key: "price",
              header: "Kaina EUR",
              render: (inv) => fmt(inv.purchasePriceEur),
              className: "text-right",
            },
            {
              key: "sale",
              header: "Pardavimas",
              render: (inv) =>
                inv.saleDate
                  ? `${inv.saleDate} — ${fmt(inv.salePriceEur ?? 0)}`
                  : "Nepatdavinta",
            },
            {
              key: "actions",
              header: "",
              render: (inv) => (
                <button
                  onClick={() => remove(inv.id)}
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
