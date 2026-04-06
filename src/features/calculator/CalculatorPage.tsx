import { useState, useMemo, useEffect } from "react";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { Badge } from "../../components/Badge";
import { calculateOptimizedTax } from "../../lib/optimizer";
import { taxRatesByYear } from "../../data/tax-rates";
import { useSettingsStore } from "../../stores/settings-store";
import type { WithdrawalPlan, Income, Expense } from "../../types";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const availableYears = Object.keys(taxRatesByYear).map(Number);

export function CalculatorPage() {
  const { settings, loaded, hydrate } = useSettingsStore();

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  const planned = settings.plannedMonthlyIncome;
  const plan = settings.withdrawalPlan;

  const [year, setYear] = useState(settings.fiscalYear);
  const [income, setIncome] = useState(planned > 0 ? String(planned * 12) : "");
  const [expenseAmount, setExpenseAmount] = useState("");

  // Prefill from settings when they load
  useEffect(() => {
    if (!loaded) return;
    if (planned > 0 && income === "") setIncome(String(planned * 12));
    setYear(settings.fiscalYear);
    setSodraSelfEnabled(plan.sodraSelfEnabled);
    if (plan.sodraSelfBase > 0) setSodraSelfBase(String(plan.sodraSelfBase));
    setCivilContractEnabled(plan.civilContractEnabled);
    if (plan.civilContractAnnual > 0) setCivilContractAnnual(String(plan.civilContractAnnual));
    setDividendsEnabled(plan.dividendsEnabled);
    setWithdrawAll(plan.withdrawAll);
    if (plan.withdrawalTarget > 0) setWithdrawalTarget(String(plan.withdrawalTarget));
    if (settings.activityStartDate) setActivityStartDate(settings.activityStartDate);
  }, [loaded]);

  const rates = taxRatesByYear[year];
  const [activityStartDate, setActivityStartDate] = useState(settings.activityStartDate ?? "");

  const [sodraSelfEnabled, setSodraSelfEnabled] = useState(plan.sodraSelfEnabled);
  const [sodraSelfBase, setSodraSelfBase] = useState("");
  const [civilContractEnabled, setCivilContractEnabled] = useState(plan.civilContractEnabled);
  const [civilContractAnnual, setCivilContractAnnual] = useState("");
  const [dividendsEnabled, setDividendsEnabled] = useState(true);
  const [withdrawAll, setWithdrawAll] = useState(true);
  const [withdrawalTarget, setWithdrawalTarget] = useState("");

  const result = useMemo(() => {
    const inc = Number(income) || 0;
    const exp = Number(expenseAmount) || 0;
    if (inc === 0) return null;

    const fakeIncome: Income[] = [
      {
        id: "calc",
        date: `${year}-06-15`,
        description: "Skaiciavimas",
        amount: inc,
        currency: "EUR",
        amountEur: inc,
        category: "services",
        client: "Optimizatorius",
        sourceCountry: "US",
      },
    ];

    const fakeExpense: Expense[] =
      exp > 0
        ? [
            {
              id: "calc-exp",
              date: `${year}-06-15`,
              description: "Islaidos",
              amount: exp,
              currency: "EUR",
              amountEur: exp,
              category: "other",
              vatDeductible: false,
            },
          ]
        : [];

    const plan: WithdrawalPlan = {
      sodraSelfEnabled,
      sodraSelfBase: sodraSelfEnabled ? Number(sodraSelfBase) || 0 : 0,
      civilContractEnabled,
      civilContractAnnual: civilContractEnabled ? Number(civilContractAnnual) || 0 : 0,
      dividendsEnabled,
      withdrawAll,
      withdrawalTarget: Number(withdrawalTarget) || 0,
    };

    return calculateOptimizedTax(fakeIncome, fakeExpense, year, plan, {
      activityStartDate: activityStartDate || undefined,
    });
  }, [
    income,
    expenseAmount,
    year,
    sodraSelfEnabled,
    sodraSelfBase,
    activityStartDate,
    civilContractEnabled,
    civilContractAnnual,
    dividendsEnabled,
    withdrawAll,
    withdrawalTarget,
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mokesciu optimizatorius</h1>

      {/* Income & expenses */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Metai</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Metines MB pajamos (EUR)</span>
            <input
              type="number"
              step="0.01"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="pvz. 50000"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Metines MB islaidos (EUR)</span>
            <input
              type="number"
              step="0.01"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="pvz. 5000"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Veiklos pradžia</span>
            <input
              type="date"
              value={activityStartDate}
              onChange={(e) => setActivityStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {activityStartDate && year === new Date(activityStartDate).getFullYear() && (
              <span className="mt-1 text-xs text-green-600">Pirmi metai — pelno mokestis 0%</span>
            )}
          </label>
        </div>
      </Card>

      {/* How much to withdraw */}
      <Card title="Kiek issiimti">
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={withdrawAll}
              onChange={() => setWithdrawAll(true)}
              className="border-gray-300"
            />
            <span className="text-sm text-gray-700">Visą pelną</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={!withdrawAll}
              onChange={() => setWithdrawAll(false)}
              className="border-gray-300"
            />
            <span className="text-sm text-gray-700">Konkrečią sumą (likutis lieka MB — investicijoms, rezervui)</span>
          </label>
          {!withdrawAll && (
            <input
              type="number"
              step="1000"
              value={withdrawalTarget}
              onChange={(e) => setWithdrawalTarget(e.target.value)}
              placeholder="pvz. 30000"
              className="ml-6 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          )}
          {!withdrawAll && result && result.remainingInMB > 0 && (
            <p className="ml-6 text-sm text-gray-500">
              MB liks: {fmt(result.remainingInMB)} (pelno mokestis: {(result.pelnoMokestisRate * 100).toFixed(0)}%{result.pelnoMokestisRate === 0 ? " — pirmi metai" : ""})
            </p>
          )}
        </div>
      </Card>

      {/* Withdrawal methods */}
      <Card title="Isemimo budai">
        <div className="space-y-4">
          {/* Sodra stažui */}
          <div className="rounded-md border border-gray-200 p-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sodraSelfEnabled}
                onChange={(e) => setSodraSelfEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-900">
                Sodra stažui (savarankiškai)
              </span>
              <Badge variant="success">Stažas</Badge>
            </label>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              GPM netaikomas, VSD+PSD nuo pasirinktos bazės (min MMA), stažo kaupimas
            </p>
            {sodraSelfEnabled && (
              <label className="mt-3 block">
                <span className="text-sm text-gray-600">
                  Mėnesinė Sodra bazė (EUR)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={sodraSelfBase}
                  onChange={(e) => setSodraSelfBase(e.target.value)}
                  placeholder={String(rates?.minMonthlyWage ?? 0)}
                  className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  0 arba tuščia = MMA ({fmt(rates?.minMonthlyWage ?? 0)})
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  Registruojatės Sodroje kaip savarankiškai dirbantis. Galima derinti su bet kuriuo išėmimo būdu.
                </span>
              </label>
            )}
          </div>

          {/* Civil contract */}
          <div className="rounded-md border border-gray-200 p-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={civilContractEnabled}
                onChange={(e) => setCivilContractEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-900">
                Civiline sutartis
              </span>
              <Badge variant="info">GPM 15%</Badge>
            </label>
            {civilContractEnabled && (
              <div className="mt-3">
                <label className="block">
                  <span className="text-sm text-gray-600">
                    Metine suma (EUR)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={civilContractAnnual}
                    onChange={(e) => setCivilContractAnnual(e.target.value)}
                    placeholder="pvz. 30000"
                    className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                {Number(civilContractAnnual) > (rates?.vatThreshold ?? 45000) && (
                  <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Civilines sutarties suma virsija {fmt(rates?.vatThreshold ?? 45000)} PVM
                    registracijos ribą! Privalote registruotis PVM moketoju.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dividends */}
          <div className="rounded-md border border-gray-200 p-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dividendsEnabled}
                onChange={(e) => setDividendsEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-900">
                Pelno isemimas (dividendai)
              </span>
              <Badge variant="info">GPM 15%</Badge>
            </label>
            {dividendsEnabled && (
              <p className="mt-2 text-sm text-gray-500">
                Gauna likusia suma automatiskai
                {result &&
                  result.withdrawals.find((w) => w.method === "dividends") &&
                  `: ${fmt(result.withdrawals.find((w) => w.method === "dividends")!.amount)}`}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* VAT warning */}
      {result?.vatWarning && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="danger">PVM</Badge>
            <span className="text-lg font-semibold text-red-800">
              Virsyta PVM registracijos riba!
            </span>
          </div>
          <p className="mt-2 text-sm text-red-700">
            Civilines sutarties pajamos virsija {fmt(rates?.vatThreshold ?? 45000)} ribą.
            Privalote registruotis PVM moketoju ir skaiciuoti PVM.
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="MB pelnas" value={fmt(result.mbProfit)} />
            <StatCard label="Viso mokesciu" value={fmt(result.totalTax)} />
            <StatCard
              label="Efektyvus tarifas"
              value={pct(result.effectiveRate)}
            />
            <StatCard label="Grynos pajamos" value={fmt(result.totalNet)} trend="up" />
            <StatCard
              label="Stazo menesiai"
              value={`${result.stazasMonths.toFixed(1)} men.`}
            />
          </div>

          {/* Remaining in MB warning */}
          {result.remainingInMB > 0 && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p>MB lieka neišimta: {fmt(result.remainingInMB)}</p>
              <p className="mt-1">
                Pelno mokestis: {fmt(result.pelnoMokestis)}
                {" "}({(result.pelnoMokestisRate * 100).toFixed(0)}%
                {result.pelnoMokestisRate === 0 ? " — pirmi metai, 0%" : result.pelnoMokestisRate === 0.05 ? " — maža įmonė" : ""})
              </p>
            </div>
          )}

          {/* Breakdown table */}
          <Card title="Mokesciu suskirstymas pagal buda">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2">Budas</th>
                    <th className="px-3 py-2 text-right">Suma</th>
                    <th className="px-3 py-2 text-right">GPM</th>
                    <th className="px-3 py-2 text-right">VSD</th>
                    <th className="px-3 py-2 text-right">PSD</th>
                    <th className="px-3 py-2 text-right">Darbdavio Sodra</th>
                    <th className="px-3 py-2 text-right">Viso mokesciu</th>
                    <th className="px-3 py-2 text-right">Grynai</th>
                    <th className="px-3 py-2 text-right">Stazas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.withdrawals.map((w) => (
                    <tr key={w.method} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                        {w.label}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmt(w.amount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmt(w.gpm)}{" "}
                        <span className="text-xs text-gray-400">({pct(w.gpmRate)})</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmt(w.vsd)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmt(w.psd)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {fmt(w.employerSodra)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {fmt(w.totalTax)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-green-700">
                        {fmt(w.netAmount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {w.stazasMonths.toFixed(1)} men.
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-semibold">
                    <td className="px-3 py-2">Viso</td>
                    <td className="px-3 py-2 text-right">
                      {fmt(result.withdrawals.reduce((s, w) => s + w.amount, 0))}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(result.totalGpm)}</td>
                    <td className="px-3 py-2 text-right">{fmt(result.totalVsd)}</td>
                    <td className="px-3 py-2 text-right">{fmt(result.totalPsd)}</td>
                    <td className="px-3 py-2 text-right">{fmt(result.totalEmployerSodra)}</td>
                    <td className="px-3 py-2 text-right">{fmt(result.totalTax)}</td>
                    <td className="px-3 py-2 text-right text-green-700">
                      {fmt(result.totalNet)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {result.stazasMonths.toFixed(1)} men.
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
