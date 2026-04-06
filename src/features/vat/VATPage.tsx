import { useEffect, useMemo } from "react";
import { Card } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { useIncomeStore } from "../../stores/income-store";
import { useExpenseStore } from "../../stores/expense-store";
import { useSettingsStore } from "../../stores/settings-store";
import { calculateQuarterlyVAT, isVATRegistrationRequired } from "../../lib/vat";
import type { Quarter } from "../../types";

function fmt(n: number): string {
  return n.toLocaleString("lt-LT", { style: "currency", currency: "EUR" });
}

const quarterLabels: Record<Quarter, string> = {
  1: "I ketvirtis (sausis–kovas)",
  2: "II ketvirtis (balandis–birželis)",
  3: "III ketvirtis (liepa–rugsėjis)",
  4: "IV ketvirtis (spalis–gruodis)",
};

export function VATPage() {
  const { incomes, loaded: il, hydrate: hi } = useIncomeStore();
  const { expenses, loaded: el, hydrate: he } = useExpenseStore();
  const { settings, loaded: sl, hydrate: hs } = useSettingsStore();

  useEffect(() => {
    if (!il) hi();
    if (!el) he();
    if (!sl) hs();
  }, [il, el, sl, hi, he, hs]);

  const year = settings.fiscalYear;

  const quarters = useMemo(
    () =>
      ([1, 2, 3, 4] as Quarter[]).map((q) =>
        calculateQuarterlyVAT(incomes, expenses, year, q),
      ),
    [incomes, expenses, year],
  );

  const annualVAT = useMemo(
    () => quarters.reduce((sum, q) => sum + q.vatPayable, 0),
    [quarters],
  );

  const mustRegister = useMemo(
    () => isVATRegistrationRequired(incomes, year),
    [incomes, year],
  );

  if (!il || !el || !sl) return <p className="text-gray-500">Kraunama...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">PVM ({year})</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Metinis PVM" value={fmt(annualVAT)} />
        <StatCard
          label="PVM registracija"
          value={settings.vatRegistered ? "Registruotas" : "Neregistruotas"}
        />
        <StatCard
          label="Privaloma registracija?"
          value={mustRegister ? "Taip" : "Ne"}
          subtitle={mustRegister ? "Viršytas 45 000 EUR slenkstis" : "Neviršytas slenkstis"}
          trend={mustRegister ? "down" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {quarters.map((q) => (
          <Card key={q.quarter} title={quarterLabels[q.quarter]}>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Pardavimai</dt>
                <dd className="text-sm font-medium">{fmt(q.salesAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">PVM nuo pardavimų</dt>
                <dd className="text-sm font-medium">{fmt(q.vatOnSales)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">Pirkimai (PVM atskaitomi)</dt>
                <dd className="text-sm font-medium">{fmt(q.purchaseAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">PVM nuo pirkimų</dt>
                <dd className="text-sm font-medium">{fmt(q.vatOnPurchases)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2">
                <dt className="text-sm font-semibold">Mokėtinas PVM</dt>
                <dd className="text-sm font-semibold">{fmt(q.vatPayable)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
