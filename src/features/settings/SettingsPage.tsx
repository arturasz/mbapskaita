import { useEffect, useRef, useState } from "react";
import { Card } from "../../components/Card";
import { useSettingsStore } from "../../stores/settings-store";
import { useIncomeStore } from "../../stores/income-store";
import { useExpenseStore } from "../../stores/expense-store";
import { useInvestmentStore } from "../../stores/investment-store";
import { taxRatesByYear } from "../../data/tax-rates";
import {
  exportIncomesCSV,
  exportExpensesCSV,
  exportInvestmentsCSV,
  exportFullBackup,
  importFullBackup,
} from "../../lib/export";
import type { Currency, VATScheme } from "../../types";

const availableYears = Object.keys(taxRatesByYear).map(Number);

export function SettingsPage() {
  const { settings, loaded, hydrate, update } = useSettingsStore();
  const { incomes, loaded: il, hydrate: hi } = useIncomeStore();
  const { expenses, loaded: el, hydrate: he } = useExpenseStore();
  const { investments, loaded: invl, hydrate: hinv } = useInvestmentStore();
  const [saved, setSaved] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded) hydrate();
    if (!il) hi();
    if (!el) he();
    if (!invl) hinv();
  }, [loaded, il, el, invl, hydrate, hi, he, hinv]);

  const handleChange = async (partial: Record<string, unknown>) => {
    await update(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importFullBackup(file);
      setRestoreStatus(
        `Atkurta: ${data.incomes.length} pajamos, ${data.expenses.length} išlaidos, ${data.investments.length} investicijos`,
      );
      // Re-hydrate all stores
      hydrate();
      hi();
      he();
      hinv();
    } catch (err) {
      setRestoreStatus(err instanceof Error ? err.message : "Atkūrimo klaida");
    }
    if (restoreRef.current) restoreRef.current.value = "";
  };

  if (!loaded) return <p className="text-gray-500">Kraunama...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Nustatymai</h1>
        {saved && <span className="text-sm text-green-600">Išsaugota</span>}
      </div>

      <Card title="MB informacija">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">MB pavadinimas</span>
            <input
              type="text"
              value={settings.mbName}
              onChange={(e) => handleChange({ mbName: e.target.value })}
              placeholder="pvz. MB Pavyzdys"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nario vardas, pavardė</span>
            <input
              type="text"
              value={settings.memberName}
              onChange={(e) => handleChange({ memberName: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Veiklos pradžios data</span>
            <input
              type="date"
              value={settings.activityStartDate ?? ""}
              onChange={(e) => handleChange({ activityStartDate: e.target.value || undefined })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 text-xs text-gray-500">
              Sodra lengvata taikoma pirmus 2 kalendorinius metus
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Fiskaliniai metai</span>
            <select
              value={settings.fiscalYear}
              onChange={(e) => handleChange({ fiscalYear: Number(e.target.value) })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card title="Valiuta ir PVM">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Numatytoji valiuta</span>
            <select
              value={settings.defaultCurrency}
              onChange={(e) => handleChange({ defaultCurrency: e.target.value as Currency })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">PVM schema</span>
            <select
              value={settings.vatScheme}
              onChange={(e) => handleChange({ vatScheme: e.target.value as VATScheme })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="standard">Standartinė</option>
              <option value="margin">Maržos</option>
              <option value="exempt">Neapmokestinama</option>
            </select>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.vatRegistered}
              onChange={(e) => handleChange({ vatRegistered: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">PVM mokėtojas</span>
          </label>
        </div>
      </Card>

      <Card title="Duomenų eksportas">
        <p className="mb-4 text-sm text-gray-600">
          Eksportuokite duomenis CSV formatu buhalterui arba mokesčių deklaracijai.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => exportIncomesCSV(incomes)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Pajamos CSV
          </button>
          <button
            onClick={() => exportExpensesCSV(expenses)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Išlaidos CSV
          </button>
          <button
            onClick={() => exportInvestmentsCSV(investments)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Investicijos CSV
          </button>
        </div>
      </Card>

      <Card title="Atsarginė kopija">
        <p className="mb-4 text-sm text-gray-600">
          Visa duomenų bazė viename JSON faile. Naudokite atsarginei kopijai arba perkėlimui į kitą naršyklę.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportFullBackup()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Eksportuoti atsarginę kopiją
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept=".json"
            onChange={handleRestore}
            className="hidden"
          />
          <button
            onClick={() => restoreRef.current?.click()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Atkurti iš kopijos
          </button>
        </div>
        {restoreStatus && (
          <p className="mt-3 text-sm text-green-700">{restoreStatus}</p>
        )}
      </Card>
    </div>
  );
}
