import { useEffect, useMemo, useState } from "react";
import { StatCard } from "../../components/StatCard";
import { Card } from "../../components/Card";
import { useIncomeStore } from "../../stores/income-store";
import { useExpenseStore } from "../../stores/expense-store";
import { useSettingsStore } from "../../stores/settings-store";
import {
  calculateAnnualTax,
  calculateMonthlySodra,
  calculateQuarterlyGPM,
} from "../../lib/tax";
import { taxRatesByYear } from "../../data/tax-rates";
import { getUpcomingDeadlines } from "../../data/deadlines";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

const monthNames = [
  "Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis",
  "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis",
];

const availableYears = Object.keys(taxRatesByYear).map(Number);

export function DashboardPage() {
  const { incomes, hydrate: hydrateIncome, loaded: incomeLoaded } = useIncomeStore();
  const { expenses, hydrate: hydrateExpense, loaded: expenseLoaded } = useExpenseStore();
  const { settings, hydrate: hydrateSettings, loaded: settingsLoaded, update: updateSettings } = useSettingsStore();

  useEffect(() => {
    if (!incomeLoaded) hydrateIncome();
    if (!expenseLoaded) hydrateExpense();
    if (!settingsLoaded) hydrateSettings();
  }, [incomeLoaded, expenseLoaded, settingsLoaded, hydrateIncome, hydrateExpense, hydrateSettings]);

  const [year, setYear] = useState(settings.fiscalYear);

  // Sync year with settings when settings load
  useEffect(() => {
    if (settingsLoaded) setYear(settings.fiscalYear);
  }, [settingsLoaded, settings.fiscalYear]);

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    updateSettings({ fiscalYear: newYear });
  };

  const opts = useMemo(
    () => ({
      activityStartDate: settings.activityStartDate,
      incomeMode: settings.incomeMode,
      voluntarySodra: settings.voluntarySodra,
    }),
    [settings.activityStartDate, settings.incomeMode, settings.voluntarySodra],
  );

  const tax = useMemo(
    () => calculateAnnualTax(incomes, expenses, year, opts),
    [incomes, expenses, year, opts],
  );

  const monthlySodra = useMemo(
    () => calculateMonthlySodra(incomes, expenses, year, opts),
    [incomes, expenses, year, opts],
  );

  const quarterlyGPM = useMemo(
    () => calculateQuarterlyGPM(incomes, expenses, year, opts),
    [incomes, expenses, year, opts],
  );

  const annualStazas = useMemo(
    () => monthlySodra.length > 0 ? monthlySodra[monthlySodra.length - 1].stazasCumulative : 0,
    [monthlySodra],
  );

  const deadlines = useMemo(() => getUpcomingDeadlines(new Date(), 5), []);

  if (!incomeLoaded || !expenseLoaded || !settingsLoaded) {
    return <p className="text-gray-500">Kraunama...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{year} m. suvestinė</h1>
        <select
          value={year}
          onChange={(e) => handleYearChange(Number(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Pajamos" value={fmt(tax.totalIncome)} />
        <StatCard label="Išlaidos" value={fmt(tax.totalExpenses)} />
        <StatCard label="Mokesčiai" value={fmt(tax.totalTax)} subtitle={`Efektyvus tarifas: ${(tax.effectiveRate * 100).toFixed(1)}%`} />
        <StatCard label="Grynos pajamos" value={fmt(tax.netIncome)} trend="up" />
        <StatCard
          label="Stažas"
          value={`${annualStazas.toFixed(1)} mėn.`}
          subtitle={annualStazas >= 12 ? "Pilni metai" : `Trūksta ${(12 - annualStazas).toFixed(1)} mėn.`}
          trend={annualStazas >= 12 ? "up" : "down"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Mokesčių suskirstymas">
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">GPM (15%)</dt>
              <dd className="text-sm font-medium">{fmt(tax.gpmAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">VSD (Sodra pensija)</dt>
              <dd className="text-sm font-medium">{fmt(tax.vsdAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">PSD (Sodra sveikata)</dt>
              <dd className="text-sm font-medium">{fmt(tax.psdAmount)}</dd>
            </div>
            <div className="flex justify-between border-t pt-3">
              <dt className="text-sm font-semibold text-gray-900">Viso mokesčių</dt>
              <dd className="text-sm font-semibold">{fmt(tax.totalTax)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Artimiausi terminai">
          {deadlines.length === 0 ? (
            <p className="text-sm text-gray-500">Terminų nerasta</p>
          ) : (
            <ul className="space-y-3">
              {deadlines.map((d, i) => (
                <li key={i} className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.deadline.name}</p>
                    <p className="text-xs text-gray-500">{d.deadline.description}</p>
                  </div>
                  <span className="shrink-0 text-sm text-gray-600">
                    {d.date.toLocaleDateString("lt-LT")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* GPM quarterly advances */}
      <Card title="GPM avansiniai mokėjimai (kas ketvirtį)">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-3 py-2">Ketvirtis</th>
                <th className="px-3 py-2 text-right">Pajamos YTD</th>
                <th className="px-3 py-2 text-right">Išlaidos YTD</th>
                <th className="px-3 py-2 text-right">GPM YTD</th>
                <th className="px-3 py-2 text-right">Ankstesni avansai</th>
                <th className="px-3 py-2 text-right font-bold">Mokėti</th>
              </tr>
            </thead>
            <tbody>
              {quarterlyGPM.map((q) => (
                <tr key={q.quarter} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">Q{q.quarter}</td>
                  <td className="px-3 py-2 text-right">{fmt(q.incomeYTD)}</td>
                  <td className="px-3 py-2 text-right">{fmt(q.expensesYTD)}</td>
                  <td className="px-3 py-2 text-right">{fmt(q.gpmYTD)}</td>
                  <td className="px-3 py-2 text-right">{fmt(q.previousAdvances)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(q.gpmAdvance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sodra monthly breakdown */}
      <Card title="Sodra mėnesinės įmokos">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-3 py-2">Mėnuo</th>
                <th className="px-3 py-2 text-right">VSD</th>
                <th className="px-3 py-2 text-right">PSD</th>
                <th className="px-3 py-2 text-right">Viso</th>
                <th className="px-3 py-2 text-right">Kumuliacinis</th>
                <th className="px-3 py-2 text-right">Stažas</th>
              </tr>
            </thead>
            <tbody>
              {monthlySodra.map((m) => (
                <tr key={m.month} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2">{monthNames[m.month - 1]}</td>
                  <td className="px-3 py-2 text-right">{fmt(m.vsdAmount)}</td>
                  <td className="px-3 py-2 text-right">{fmt(m.psdAmount)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(m.total)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmt(m.cumulative)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{m.stazasMonths.toFixed(2)} mėn.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
