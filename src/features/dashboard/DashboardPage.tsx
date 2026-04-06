import { useEffect, useMemo } from "react";
import { StatCard } from "../../components/StatCard";
import { Card } from "../../components/Card";
import { useIncomeStore } from "../../stores/income-store";
import { useExpenseStore } from "../../stores/expense-store";
import { useSettingsStore } from "../../stores/settings-store";
import { calculateAnnualTax } from "../../lib/tax";
import { getUpcomingDeadlines } from "../../data/deadlines";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

export function DashboardPage() {
  const { incomes, hydrate: hydrateIncome, loaded: incomeLoaded } = useIncomeStore();
  const { expenses, hydrate: hydrateExpense, loaded: expenseLoaded } = useExpenseStore();
  const { settings, hydrate: hydrateSettings, loaded: settingsLoaded } = useSettingsStore();

  useEffect(() => {
    if (!incomeLoaded) hydrateIncome();
    if (!expenseLoaded) hydrateExpense();
    if (!settingsLoaded) hydrateSettings();
  }, [incomeLoaded, expenseLoaded, settingsLoaded, hydrateIncome, hydrateExpense, hydrateSettings]);

  const year = settings.fiscalYear;
  const tax = useMemo(
    () =>
      calculateAnnualTax(incomes, expenses, year, {
        activityStartDate: settings.activityStartDate,
      }),
    [incomes, expenses, year, settings.activityStartDate],
  );

  const deadlines = useMemo(() => getUpcomingDeadlines(new Date(), 5), []);

  if (!incomeLoaded || !expenseLoaded || !settingsLoaded) {
    return <p className="text-gray-500">Kraunama...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{year} m. suvestinė</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pajamos" value={fmt(tax.totalIncome)} />
        <StatCard label="Išlaidos" value={fmt(tax.totalExpenses)} />
        <StatCard label="Mokesčiai" value={fmt(tax.totalTax)} subtitle={`Efektyvus tarifas: ${(tax.effectiveRate * 100).toFixed(1)}%`} />
        <StatCard label="Grynos pajamos" value={fmt(tax.netIncome)} trend="up" />
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
    </div>
  );
}
