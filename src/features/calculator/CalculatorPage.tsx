import { useState, useMemo } from "react";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { Badge } from "../../components/Badge";
import { calculateOptimizedTax } from "../../lib/optimizer";
import { taxRatesByYear } from "../../data/tax-rates";
import type { WithdrawalPlan, Income, Expense } from "../../types";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const availableYears = Object.keys(taxRatesByYear).map(Number);

export function CalculatorPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [income, setIncome] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  const rates = taxRatesByYear[year];

  const [salaryEnabled, setSalaryEnabled] = useState(false);
  const [salaryMonthly, setSalaryMonthly] = useState(String(rates?.minMonthlyWage ?? 0));
  const [civilContractEnabled, setCivilContractEnabled] = useState(false);
  const [civilContractAnnual, setCivilContractAnnual] = useState("");
  const [dividendsEnabled, setDividendsEnabled] = useState(true);

  // Update salary default when year changes
  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    const newRates = taxRatesByYear[newYear];
    if (newRates && salaryMonthly === String(rates?.minMonthlyWage ?? 0)) {
      setSalaryMonthly(String(newRates.minMonthlyWage));
    }
  };

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
      salaryEnabled,
      salaryMonthly: salaryEnabled ? Number(salaryMonthly) || 0 : 0,
      civilContractEnabled,
      civilContractAnnual: civilContractEnabled ? Number(civilContractAnnual) || 0 : 0,
      dividendsEnabled,
    };

    return calculateOptimizedTax(fakeIncome, fakeExpense, year, plan);
  }, [
    income,
    expenseAmount,
    year,
    salaryEnabled,
    salaryMonthly,
    civilContractEnabled,
    civilContractAnnual,
    dividendsEnabled,
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mokesciu optimizatorius</h1>

      {/* Income & expenses */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Metai</span>
            <select
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
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
        </div>
      </Card>

      {/* Withdrawal methods */}
      <Card title="Isemimo budai">
        <div className="space-y-4">
          {/* Salary */}
          <div className="rounded-md border border-gray-200 p-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={salaryEnabled}
                onChange={(e) => setSalaryEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-900">
                Darbo sutartis (alga)
              </span>
              <Badge variant="info">GPM 20%</Badge>
            </label>
            {salaryEnabled && (
              <label className="mt-3 block">
                <span className="text-sm text-gray-600">
                  Menesinis bruto atlyginimas (EUR)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={salaryMonthly}
                  onChange={(e) => setSalaryMonthly(e.target.value)}
                  placeholder={String(rates?.minMonthlyWage ?? 0)}
                  className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  MMA {year} m.: {fmt(rates?.minMonthlyWage ?? 0)}
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
              MB lieka neisimta: {fmt(result.remainingInMB)}
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
