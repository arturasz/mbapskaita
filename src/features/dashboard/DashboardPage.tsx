import { useEffect, useMemo, useState } from "react";
import { StatCard } from "../../components/StatCard";
import { Card } from "../../components/Card";
import { useIncomeStore } from "../../stores/income-store";
import { useExpenseStore } from "../../stores/expense-store";
import { useObligationStore } from "../../stores/obligation-store";
import { useWiseStore } from "../../stores/wise-store";
import { autoDonePsd, obligationKey } from "../../lib/obligation-status";
import { useDividendStore } from "../../stores/dividend-store";
import { mbInvestmentIncome } from "../../lib/investments";
import { useInvestmentStore } from "../../stores/investment-store";
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
  const { investments, hydrate: hydrateInvestments, loaded: investmentsLoaded } = useInvestmentStore();
  const { dividends, hydrate: hydrateDividends, loaded: dividendsLoaded } = useDividendStore();
  const { done: doneManual, loaded: doneLoaded, hydrate: hydrateDone, toggle: toggleDone } = useObligationStore();
  const { payments: wisePayments, loaded: wiseLoaded, hydrate: hydrateWise } = useWiseStore();
  const { settings, hydrate: hydrateSettings, loaded: settingsLoaded, update: updateSettings } = useSettingsStore();

  useEffect(() => {
    if (!incomeLoaded) hydrateIncome();
    if (!expenseLoaded) hydrateExpense();
    if (!investmentsLoaded) hydrateInvestments();
    if (!dividendsLoaded) hydrateDividends();
    if (!doneLoaded) hydrateDone();
    if (!wiseLoaded) hydrateWise();
    if (!settingsLoaded) hydrateSettings();
  }, [incomeLoaded, expenseLoaded, investmentsLoaded, dividendsLoaded, doneLoaded, wiseLoaded, hydrateDone, hydrateWise, settingsLoaded, hydrateIncome, hydrateExpense, hydrateInvestments, hydrateDividends, hydrateSettings]);

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

  const investmentIncome = useMemo(
    () => mbInvestmentIncome(investments, dividends, year),
    [investments, dividends, year],
  );

  const result = useMemo(
    () => calculateOptimizedTax(projectedIncomes, expenses, year, settings.withdrawalPlan, {
      activityStartDate: settings.activityStartDate,
      investmentIncome: investmentIncome.total,
    }),
    [projectedIncomes, expenses, year, settings.withdrawalPlan, settings.activityStartDate, investmentIncome],
  );

  const actualIncome = useMemo(
    () => incomes
      .filter((i) => i.date.startsWith(String(year)))
      .reduce((s, i) => s + i.amountEur, 0),
    [incomes, year],
  );

  // Money that stays in the MB: profit after company-level taxes and any
  // withdrawals, split into what sits in open IBKR positions and the rest (cash).
  const inMb = useMemo(() => {
    const withdrawalPsd = result.withdrawals.reduce((s, w) => s + w.psd, 0);
    const retained = result.remainingInMB - (result.totalPsd - withdrawalPsd);
    const invested = investments
      .filter((i) => !i.saleDate)
      .reduce((s, i) => s + i.purchasePriceEur, 0);
    return { retained, invested, cash: retained - invested };
  }, [result, investments]);

  const hasProjection = settings.plannedMonthlyIncome > 0 && result.totalIncome > actualIncome;

  const monthlySodra = useMemo(
    () => calculateMonthlySodraFromPlan(year, settings.withdrawalPlan),
    [year, settings.withdrawalPlan],
  );

  const obligations = useMemo(
    () => generateObligations(year, settings.withdrawalPlan, result, settings.pvmRegisteredFrom),
    [year, settings.withdrawalPlan, result, settings.pvmRegisteredFrom],
  );

  const today = new Date().toISOString().slice(0, 10);
  const autoDone = useMemo(() => autoDonePsd(obligations, wisePayments), [obligations, wisePayments]);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Pajamos"
          value={fmt(actualIncome)}
          subtitle={hasProjection ? `Prognozė: ${fmt(result.totalIncome)}` : undefined}
        />
        <StatCard label="Išlaidos" value={fmt(result.totalExpenses)} />
        <StatCard label="Mokesčiai" value={fmt(result.totalTax)} subtitle={result.withdrawals.length === 0 ? "Pinigai neišimti: tik privalomas PSD" : `Efektyvus tarifas: ${(result.effectiveRate * 100).toFixed(1)}%`} />
        <StatCard label="Grynos pajamos" value={fmt(result.totalNet)} trend="up" />
        <StatCard
          label="Stažas"
          value={`${result.stazasMonths.toFixed(1)} mėn.`}
          subtitle={result.stazasMonths >= 12 ? "Pilni metai" : `Trūksta ${(12 - result.stazasMonths).toFixed(1)} mėn.`}
          trend={result.stazasMonths >= 12 ? "up" : "down"}
        />
      </div>

      <Card title="Pinigai MB viduje">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-gray-600">Liko MB po mokesčių</dt>
            <dd className="text-lg font-semibold">{fmt(inMb.retained)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Investuota (IBKR, savikaina)</dt>
            <dd className="text-lg font-semibold">{fmt(inMb.invested)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Likusi grynųjų dalis</dt>
            <dd className="text-lg font-semibold">{fmt(inMb.cash)}</dd>
          </div>
          <div className="sm:col-span-3 text-xs text-gray-500">
            Į pelną įtraukta: realizuotas investicijų pelnas {fmt(investmentIncome.realizedGain)}, dividendai grynai {fmt(investmentIncome.dividends)}
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-500">
          Investicijos MB vardu nėra išėmimas, todėl GPM nemokamas. GPM ir Sodra atsiranda tik išsiimant
          pinigus (nustatymuose įjunkite išėmimo scenarijų).
        </p>
      </Card>

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
            {result.pelnoMokestis > 0 && (
            <div className="flex justify-between">
              <dt className="text-sm text-gray-600">
                Pelno mokestis ({(result.pelnoMokestisRate * 100).toFixed(0)}%)
              </dt>
              <dd className="text-sm font-medium">{fmt(result.pelnoMokestis)}</dd>
            </div>
            )}
            {result.pelnoMokestisRate === 0 && result.remainingInMB > 0 && (
            <div className="flex justify-between">
              <dt className="text-sm text-green-600">Pelno mokestis (0% — pirmi metai)</dt>
              <dd className="text-sm font-medium text-green-600">{fmt(0)}</dd>
            </div>
            )}
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
                const key = obligationKey(o);
                const isAuto = autoDone.has(key);
                const isDone = isAuto || key in doneManual;
                const overdue = !isDone && o.dueDate < today;
                return (
                <li key={i} className={isDone ? "opacity-50" : ""}>
                  <details className="group">
                    <summary className="flex cursor-pointer items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={isDone}
                        disabled={isAuto}
                        title={isAuto ? "Atpažinta automatiškai iš Wise išrašo" : "Pažymėti kaip atliktą"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleDone(key, today)}
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isDone ? "text-gray-400 line-through" : "text-gray-900"}`}>
                          {o.name}
                          {isAuto && <span className="ml-2 text-xs font-normal text-green-700">auto (Wise)</span>}
                          {overdue && <span className="ml-2 text-xs font-semibold text-red-600">Vėluoja</span>}
                        </p>
                        <p className="text-xs text-gray-500">{o.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`text-sm ${overdue ? "font-semibold text-red-600" : isDone ? "text-gray-400" : "text-gray-600"}`}>
                          {new Date(o.dueDate).toLocaleDateString("lt-LT")}
                        </span>
                        {o.amount != null && (
                          <p className={`text-xs font-medium ${isDone ? "text-gray-400" : "text-gray-700"}`}>{fmt(o.amount)}</p>
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
