import { useEffect, useMemo, useState } from "react";
import { StatCard } from "../../components/StatCard";
import { Card } from "../../components/Card";
import { useIncomeStore } from "../../stores/income-store";
import { useExpenseStore } from "../../stores/expense-store";
import { useSettingsStore } from "../../stores/settings-store";
import {
  calculateOptimizedTax,
  calculateMonthlySodraFromPlan,
  generateObligations,
} from "../../lib/optimizer";
import { taxRatesByYear } from "../../data/tax-rates";

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

  // Blend actual incomes with projected future months
  const projectedIncomes = useMemo(() => {
    const planned = settings.plannedMonthlyIncome;
    if (!planned || planned <= 0) return incomes;

    const now = new Date();
    const currentMonth = now.getFullYear() === year ? now.getMonth() : 12;
    const projected = [...incomes];

    for (let m = currentMonth; m < 12; m++) {
      projected.push({
        id: `projected-${year}-${m}`,
        date: `${year}-${String(m + 1).padStart(2, "0")}-15`,
        description: "Planuojamos pajamos",
        amount: planned,
        currency: "USD",
        amountEur: planned, // user enters in EUR equivalent
        category: "services",
        client: "Prognozė",
        sourceCountry: "US",
      });
    }
    return projected;
  }, [incomes, year, settings.plannedMonthlyIncome]);

  const result = useMemo(
    () => calculateOptimizedTax(projectedIncomes, expenses, year, settings.withdrawalPlan),
    [projectedIncomes, expenses, year, settings.withdrawalPlan],
  );

  const monthlySodra = useMemo(
    () => calculateMonthlySodraFromPlan(year, settings.withdrawalPlan),
    [year, settings.withdrawalPlan],
  );

  const obligations = useMemo(
    () => generateObligations(year, settings.withdrawalPlan, result),
    [year, settings.withdrawalPlan, result],
  );

  const today = new Date().toISOString().slice(0, 10);

  // Deduplicate by name+date, show all (past greyed out, upcoming normal)
  const allObligations = useMemo(() => {
    const seen = new Set<string>();
    return obligations.filter((o) => {
      const key = `${o.name}:${o.dueDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [obligations]);

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

      {/* VAT warning banner */}
      {result.vatWarning && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-800">
            Dėmesio: civilinės sutarties suma viršija PVM registracijos ribą (45 000 EUR).
            Gali tekti registruotis PVM mokėtoju.
          </p>
        </div>
      )}

      {settings.plannedMonthlyIncome > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-800">
            Skaičiai apima prognozę: {fmt(settings.plannedMonthlyIncome)}/mėn. likusiam laikotarpiui.
            Faktinės pajamos: {fmt(incomes.filter((i) => i.date.startsWith(String(year))).reduce((s, i) => s + i.amountEur, 0))}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Pajamos (su prognoze)" value={fmt(result.totalIncome)} />
        <StatCard label="Išlaidos" value={fmt(result.totalExpenses)} />
        <StatCard label="Mokesčiai" value={fmt(result.totalTax)} subtitle={`Efektyvus tarifas: ${(result.effectiveRate * 100).toFixed(1)}%`} />
        <StatCard label="Grynos pajamos" value={fmt(result.totalNet)} trend="up" />
        <StatCard
          label="Stažas"
          value={`${result.stazasMonths.toFixed(1)} mėn.`}
          subtitle={result.stazasMonths >= 12 ? "Pilni metai" : `Trūksta ${(12 - result.stazasMonths).toFixed(1)} mėn.`}
          trend={result.stazasMonths >= 12 ? "up" : "down"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Mokesčių suskirstymas">
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">GPM</dt>
              <dd className="text-sm font-medium">{fmt(result.totalGpm)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">VSD (Sodra pensija)</dt>
              <dd className="text-sm font-medium">{fmt(result.totalVsd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">PSD (Sodra sveikata)</dt>
              <dd className="text-sm font-medium">{fmt(result.totalPsd)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">Darbdavio Sodra</dt>
              <dd className="text-sm font-medium">{fmt(result.totalEmployerSodra)}</dd>
            </div>
            <div className="flex justify-between border-t pt-3">
              <dt className="text-sm font-semibold text-gray-900">Viso mokesčių</dt>
              <dd className="text-sm font-semibold">{fmt(result.totalTax)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Įsipareigojimai">
          {allObligations.length === 0 ? (
            <p className="text-sm text-gray-500">Įsipareigojimų nerasta</p>
          ) : (
            <ul className="space-y-1 max-h-[600px] overflow-y-auto">
              {allObligations.map((o, i) => {
                const isPast = o.dueDate < today;
                return (
                <li key={i} className={isPast ? "opacity-40" : ""}>
                  <details className="group">
                    <summary className="flex cursor-pointer items-start justify-between rounded-md px-2 py-2 hover:bg-gray-50">
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isPast ? "text-gray-400 line-through" : "text-gray-900"}`}>{o.name}</p>
                        <p className="text-xs text-gray-500">{o.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`text-sm ${isPast ? "text-gray-400" : "text-gray-600"}`}>
                          {new Date(o.dueDate).toLocaleDateString("lt-LT")}
                        </span>
                        {o.amount != null && (
                          <p className={`text-xs font-medium ${isPast ? "text-gray-400" : "text-gray-700"}`}>{fmt(o.amount)}</p>
                        )}
                      </div>
                    </summary>
                    {o.steps.length > 0 && (
                      <ol className="ml-4 mt-2 mb-3 space-y-2 border-l-2 border-blue-200 pl-4">
                        {o.steps.map((step, j) => (
                          <li key={j} className="text-sm">
                            <p className="text-gray-700">{j + 1}. {step.action}</p>
                            {step.portal && (
                              <p className="mt-0.5 text-xs text-blue-600">{step.portal}</p>
                            )}
                            {step.form && (
                              <p className="mt-0.5 text-xs text-gray-500">Forma: <span className="font-mono font-medium">{step.form}</span></p>
                            )}
                            {step.account && (
                              <p className="mt-0.5 text-xs text-gray-500">{step.account}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </details>
                </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Withdrawal breakdown */}
      {result.withdrawals.length > 0 && (
        <Card title="Išėmimų suskirstymas">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-3 py-2">Būdas</th>
                  <th className="px-3 py-2 text-right">Suma</th>
                  <th className="px-3 py-2 text-right">GPM</th>
                  <th className="px-3 py-2 text-right">VSD</th>
                  <th className="px-3 py-2 text-right">PSD</th>
                  <th className="px-3 py-2 text-right">Darbdavio Sodra</th>
                  <th className="px-3 py-2 text-right">Viso mokesčių</th>
                  <th className="px-3 py-2 text-right">Grynai</th>
                  <th className="px-3 py-2 text-right">Stažas</th>
                </tr>
              </thead>
              <tbody>
                {result.withdrawals.map((w) => (
                  <tr key={w.method} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{w.label}</td>
                    <td className="px-3 py-2 text-right">{fmt(w.amount)}</td>
                    <td className="px-3 py-2 text-right">{fmt(w.gpm)} <span className="text-xs text-gray-400">({(w.gpmRate * 100).toFixed(0)}%)</span></td>
                    <td className="px-3 py-2 text-right">{fmt(w.vsd)}</td>
                    <td className="px-3 py-2 text-right">{fmt(w.psd)}</td>
                    <td className="px-3 py-2 text-right">{fmt(w.employerSodra)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(w.totalTax)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(w.netAmount)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{w.stazasMonths.toFixed(1)} mėn.</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="px-3 py-2">Viso</td>
                  <td className="px-3 py-2 text-right">{fmt(result.withdrawals.reduce((s, w) => s + w.amount, 0))}</td>
                  <td className="px-3 py-2 text-right">{fmt(result.totalGpm)}</td>
                  <td className="px-3 py-2 text-right">{fmt(result.totalVsd)}</td>
                  <td className="px-3 py-2 text-right">{fmt(result.totalPsd)}</td>
                  <td className="px-3 py-2 text-right">{fmt(result.totalEmployerSodra)}</td>
                  <td className="px-3 py-2 text-right">{fmt(result.totalTax)}</td>
                  <td className="px-3 py-2 text-right">{fmt(result.totalNet)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{result.stazasMonths.toFixed(1)} mėn.</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {result.remainingInMB > 0 && (
            <p className="mt-3 text-sm text-gray-500">
              Likutis MB: {fmt(result.remainingInMB)} (neišimtas pelnas)
            </p>
          )}
        </Card>
      )}

      {/* Sodra monthly breakdown */}
      <Card title="Sodra mėnesinės įmokos">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-3 py-2">Mėnuo</th>
                <th className="px-3 py-2 text-right">VSD</th>
                <th className="px-3 py-2 text-right">PSD</th>
                <th className="px-3 py-2 text-right">Darbdavio Sodra</th>
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
                  <td className="px-3 py-2 text-right">{fmt(m.employerSodra)}</td>
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
