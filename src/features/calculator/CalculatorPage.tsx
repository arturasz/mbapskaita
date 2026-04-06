import { useState, useMemo } from "react";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { Badge } from "../../components/Badge";
import { calculateAnnualTax, isInSodraDiscountPeriod } from "../../lib/tax";
import { taxRatesByYear } from "../../data/tax-rates";
import type { Income, Expense, IncomeSourceCountry, MBIncomeMode } from "../../types";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

const availableYears = Object.keys(taxRatesByYear).map(Number);

export function CalculatorPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [income, setIncome] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [activityStartDate, setActivityStartDate] = useState("");
  const [sourceCountry, setSourceCountry] = useState<IncomeSourceCountry>("US");
  const [incomeMode, setIncomeMode] = useState<MBIncomeMode>("civil_contract");
  const [voluntarySodra, setVoluntarySodra] = useState(false);

  const discountActive = isInSodraDiscountPeriod(year, activityStartDate || undefined);

  const tax = useMemo(() => {
    const inc = Number(income) || 0;
    const exp = Number(expenseAmount) || 0;
    if (inc === 0) return null;

    const fakeIncome: Income[] = [
      {
        id: "calc",
        date: `${year}-06-15`,
        description: "Skaičiavimas",
        amount: inc,
        currency: "EUR",
        amountEur: inc,
        category: "services",
        client: "Skaičiuoklė",
        sourceCountry,
      },
    ];
    const fakeExpense: Expense[] =
      exp > 0
        ? [
            {
              id: "calc-exp",
              date: `${year}-06-15`,
              description: "Skaičiavimas",
              amount: exp,
              currency: "EUR",
              amountEur: exp,
              category: "other",
              vatDeductible: false,
            },
          ]
        : [];

    return calculateAnnualTax(fakeIncome, fakeExpense, year, {
      activityStartDate: activityStartDate || undefined,
      incomeMode,
      voluntarySodra,
    });
  }, [income, expenseAmount, year, activityStartDate, sourceCountry, incomeMode, voluntarySodra]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mokesčių skaičiuoklė</h1>

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
            <span className="text-sm font-medium text-gray-700">Metinės pajamos (EUR)</span>
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
            <span className="text-sm font-medium text-gray-700">Metinės išlaidos (EUR)</span>
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
            <span className="text-sm font-medium text-gray-700">Pajamų būdas</span>
            <select
              value={incomeMode}
              onChange={(e) => setIncomeMode(e.target.value as MBIncomeMode)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="civil_contract">Civilinė sutartis</option>
              <option value="profit_withdrawal">Pelno išėmimas</option>
            </select>
          </label>
          {incomeMode === "profit_withdrawal" && (
            <label className="flex items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={voluntarySodra}
                onChange={(e) => setVoluntarySodra(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Savanoriška Sodra (stažui)</span>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Pajamų šaltinis</span>
            <select
              value={sourceCountry}
              onChange={(e) => setSourceCountry(e.target.value as IncomeSourceCountry)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="LT">Lietuva</option>
              <option value="US">JAV</option>
              <option value="GB">Jungtinė Karalystė</option>
              <option value="DE">Vokietija</option>
              <option value="Other">Kita</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Veiklos pradžia</span>
            <input
              type="date"
              value={activityStartDate}
              onChange={(e) => setActivityStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {discountActive && (
              <Badge variant="success">Sodra lengvata taikoma</Badge>
            )}
          </label>
        </div>
      </Card>

      {tax && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Apmokestinamos pajamos" value={fmt(tax.taxableIncome)} />
            <StatCard label="Viso mokesčių" value={fmt(tax.totalTax)} />
            <StatCard
              label="Efektyvus tarifas"
              value={`${(tax.effectiveRate * 100).toFixed(1)}%`}
            />
            <StatCard label="Grynos pajamos" value={fmt(tax.netIncome)} trend="up" />
          </div>

          <Card title="Mokesčių suskirstymas">
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">GPM (15%)</dt>
                <dd className="text-sm font-medium">{fmt(tax.gpmAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">
                  VSD (Sodra pensija, 12.52%)
                  {discountActive && (
                    <span className="ml-2 text-xs text-green-600">lengvata — nuo MMA bazės</span>
                  )}
                </dt>
                <dd className="text-sm font-medium">{fmt(tax.vsdAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">PSD (Sodra sveikata, 6.98%)</dt>
                <dd className="text-sm font-medium">{fmt(tax.psdAmount)}</dd>
              </div>
              <div className="flex justify-between border-t pt-3">
                <dt className="text-sm font-semibold">Viso</dt>
                <dd className="text-sm font-semibold">{fmt(tax.totalTax)}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
