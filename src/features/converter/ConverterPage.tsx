import { useState, useCallback, useMemo } from "react";
import { Card } from "../../components/Card";
import { Table } from "../../components/Table";
import { FileImport } from "../../components/FileImport";
import {
  parseTransactionCSV,
  parseDeelInvoiceCSV,
  deduplicateTransactions,
  findMissingMonths,
  type Transaction,
} from "../../lib/parse-transactions";
import {
  fetchRatesForCurrency,
  findRate,
  type LBRate,
} from "../../lib/lb-rates";

const MONTH_NAMES = [
  "Sausis",
  "Vasaris",
  "Kovas",
  "Balandis",
  "Gegužė",
  "Birželis",
  "Liepa",
  "Rugpjūtis",
  "Rugsėjis",
  "Spalis",
  "Lapkritis",
  "Gruodis",
];

const fmt = (n: number) =>
  n.toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type EnrichedTransaction = Transaction & { idx: number };

function enrichWithRates(
  transactions: Transaction[],
  rates: LBRate[],
): EnrichedTransaction[] {
  return transactions.map((t, i) => {
    if (t.currency === "EUR") {
      return { ...t, rate: 1, rateDate: t.date, amountEur: t.amount, idx: i };
    }
    const r = findRate(
      rates.filter((rt) => rt.currency === t.currency),
      t.date,
    );
    if (r) {
      return {
        ...t,
        rate: r.rate,
        rateDate: r.date,
        amountEur: Math.round((t.amount / r.rate) * 100) / 100,
        idx: i,
      };
    }
    return { ...t, idx: i };
  });
}

function makeColumns(
  currencyLabel: string,
): {
  key: string;
  header: string;
  className?: string;
  render: (t: EnrichedTransaction) => React.ReactNode;
}[] {
  return [
    {
      key: "idx",
      header: "#",
      render: (t: EnrichedTransaction) => t.idx + 1,
    },
    {
      key: "date",
      header: "Data",
      render: (t: EnrichedTransaction) => t.date,
    },
    {
      key: "client",
      header: "Klientas",
      render: (t: EnrichedTransaction) =>
        t.client.replace(/\s*\(.*?\)\s*$/, ""),
    },
    {
      key: "amount",
      header: `Suma (${currencyLabel})`,
      className: "text-right",
      render: (t: EnrichedTransaction) => fmt(t.amount),
    },
    {
      key: "rate",
      header: "LB kursas",
      className: "text-right",
      render: (t: EnrichedTransaction) =>
        t.rate != null ? t.rate.toFixed(4) : "—",
    },
    {
      key: "rateDate",
      header: "Kurso data",
      render: (t: EnrichedTransaction) => {
        if (!t.rateDate) return "—";
        if (t.rateDate !== t.date) {
          return (
            <span className="text-amber-600" title="Artimiausia darbo diena">
              {t.rateDate}
            </span>
          );
        }
        return t.rateDate;
      },
    },
    {
      key: "eur",
      header: "Suma (EUR)",
      className: "text-right font-medium",
      render: (t: EnrichedTransaction) =>
        t.amountEur != null ? fmt(t.amountEur) : "—",
    },
  ];
}

// --- Quick converter ---

interface ConvertedLine {
  original: number;
  converted: number;
}

function QuickConverter({ rates }: { rates: LBRate[] }) {
  const [input, setInput] = useState("");
  const [date, setDate] = useState("2025-12-31");
  const [fromCurrency, setFromCurrency] = useState<"USD" | "EUR">("USD");

  const toCurrency = fromCurrency === "USD" ? "EUR" : "USD";

  const usdRates = useMemo(
    () => rates.filter((r) => r.currency === "USD"),
    [rates],
  );
  const currentRate = findRate(usdRates, date);

  const lines: ConvertedLine[] = useMemo(() => {
    if (!currentRate) return [];
    return input
      .split("\n")
      .map((l) => l.trim().replace(/[^\d.,\-]/g, "").replace(",", "."))
      .filter((l) => l !== "")
      .map((l) => {
        const n = parseFloat(l);
        if (isNaN(n)) return null;
        const converted =
          fromCurrency === "USD"
            ? Math.round((n / currentRate.rate) * 100) / 100
            : Math.round(n * currentRate.rate * 100) / 100;
        return { original: n, converted };
      })
      .filter((l): l is ConvertedLine => l !== null);
  }, [input, currentRate, fromCurrency]);

  const totalOriginal = lines.reduce((s, l) => s + l.original, 0);
  const totalConverted = lines.reduce((s, l) => s + l.converted, 0);

  return (
    <Card title="Konverteris">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500">
            Kryptis
          </label>
          <button
            onClick={() =>
              setFromCurrency((c) => (c === "USD" ? "EUR" : "USD"))
            }
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            {fromCurrency} → {toCurrency}
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">
            Data
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="text-sm text-gray-600">
          {currentRate ? (
            <>
              LB kursas: <span className="font-medium">{currentRate.rate.toFixed(4)}</span>
              {currentRate.date !== date && (
                <span className="ml-1 text-amber-600">({currentRate.date})</span>
              )}
            </>
          ) : rates.length > 0 ? (
            <span className="text-amber-600">Kursas nerastas šiai datai</span>
          ) : (
            <span className="text-gray-400">
              Pirmiausia gaukite LB kursus
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-500">
            Sumos ({fromCurrency}) — po vieną eilutėje
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={8}
            placeholder={"12500\n13750\n3000"}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">
            Rezultatas ({toCurrency})
          </label>
          <div className="mt-1 min-h-[11rem] rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            {lines.length > 0 ? (
              <table className="w-full font-mono text-sm">
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="pr-3 text-right text-gray-400">
                        {fmt(l.original)}
                      </td>
                      <td className="text-gray-400">→</td>
                      <td className="pl-3 text-right font-medium text-gray-900">
                        {fmt(l.converted)}
                      </td>
                    </tr>
                  ))}
                  {lines.length > 1 && (
                    <tr className="border-t border-gray-300">
                      <td className="pr-3 pt-1 text-right font-bold text-gray-600">
                        {fmt(totalOriginal)}
                      </td>
                      <td className="pt-1 text-gray-400">→</td>
                      <td className="pl-3 pt-1 text-right font-bold text-gray-900">
                        {fmt(totalConverted)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <p className="py-6 text-center text-sm text-gray-400">
                Įveskite sumas kairėje
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// --- Main page ---

export function ConverterPage() {
  const [year, setYear] = useState(2025);
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Transaction[]>([]);
  const [rates, setRates] = useState<LBRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"payment" | "invoice">("payment");
  const [paymentStats, setPaymentStats] = useState<{
    added: number;
    skipped: number;
  } | null>(null);
  const [invoiceStats, setInvoiceStats] = useState<{
    added: number;
    skipped: number;
  } | null>(null);

  const yearPayments = payments
    .filter((t) => t.date.startsWith(`${year}`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const yearInvoices = invoices
    .filter((t) => t.date.startsWith(`${year}`))
    .sort((a, b) => a.date.localeCompare(b.date));

  const enrichedPayments = enrichWithRates(yearPayments, rates);
  const enrichedInvoices = enrichWithRates(yearInvoices, rates);

  const totalPaymentOriginal = enrichedPayments.reduce(
    (s, t) => s + t.amount,
    0,
  );
  const totalPaymentEur = enrichedPayments.reduce(
    (s, t) => s + (t.amountEur ?? 0),
    0,
  );
  const totalInvoiceOriginal = enrichedInvoices.reduce(
    (s, t) => s + t.amount,
    0,
  );
  const totalInvoiceEur = enrichedInvoices.reduce(
    (s, t) => s + (t.amountEur ?? 0),
    0,
  );

  const hasRates = rates.length > 0;
  const hasBoth = yearPayments.length > 0 && yearInvoices.length > 0;
  const hasAny = yearPayments.length > 0 || yearInvoices.length > 0;

  const missingPaymentMonths = findMissingMonths(payments, year);
  const missingInvoiceMonths = findMissingMonths(invoices, year);

  const handlePaymentFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setPaymentStats(null);
      const allNew: Transaction[] = [];
      for (const file of files) {
        try {
          allNew.push(...parseTransactionCSV(await file.text()));
        } catch (e) {
          setError(
            `Klaida faile ${file.name}: ${e instanceof Error ? e.message : "nežinoma"}`,
          );
          return;
        }
      }
      const combined = deduplicateTransactions([...payments, ...allNew]);
      setPaymentStats({
        added: combined.length - payments.length,
        skipped: allNew.length - (combined.length - payments.length),
      });
      setPayments(combined);
    },
    [payments],
  );

  const handleInvoiceFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setInvoiceStats(null);
      const allNew: Transaction[] = [];
      for (const file of files) {
        try {
          allNew.push(...parseDeelInvoiceCSV(await file.text()));
        } catch (e) {
          setError(
            `Klaida faile ${file.name}: ${e instanceof Error ? e.message : "nežinoma"}`,
          );
          return;
        }
      }
      const combined = deduplicateTransactions([...invoices, ...allNew]);
      setInvoiceStats({
        added: combined.length - invoices.length,
        skipped: allNew.length - (combined.length - invoices.length),
      });
      setInvoices(combined);
    },
    [invoices],
  );

  const fetchRatesClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allTxns = [...yearPayments, ...yearInvoices];
      const currencies = new Set(
        allTxns.map((t) => t.currency).filter((c) => c !== "EUR"),
      );
      // Always fetch USD so the quick converter works
      currencies.add("USD");
      const allRates: LBRate[] = [];
      for (const ccy of currencies) {
        allRates.push(...(await fetchRatesForCurrency(ccy, year)));
      }
      setRates(allRates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klaida gaunant kursus");
    } finally {
      setLoading(false);
    }
  }, [yearPayments, yearInvoices, year]);

  const clear = () => {
    setPayments([]);
    setInvoices([]);
    setRates([]);
    setPaymentStats(null);
    setInvoiceStats(null);
    setError(null);
  };

  const activeData =
    tab === "payment" ? enrichedPayments : enrichedInvoices;
  const activeCurrency =
    (tab === "payment" ? yearPayments : yearInvoices)[0]?.currency ?? "USD";
  const activeTotal =
    tab === "payment" ? totalPaymentOriginal : totalInvoiceOriginal;
  const activeTotalEur =
    tab === "payment" ? totalPaymentEur : totalInvoiceEur;
  const activeMissing =
    tab === "payment" ? missingPaymentMonths : missingInvoiceMonths;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Valiutos kursai (individualiai veiklai)
        </h1>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Metai:</label>
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setRates([]);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <FileImport
            label="Transakcijos CSV"
            accept=".csv"
            multiple
            onFiles={handlePaymentFiles}
          />
          <FileImport
            label="Sąskaitos CSV"
            accept=".csv"
            multiple
            onFiles={handleInvoiceFiles}
          />
          <button
            onClick={fetchRatesClick}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Kraunama..." : "Gauti LB kursus"}
          </button>
          {hasAny && (
            <button
              onClick={clear}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Išvalyti
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
          {paymentStats && (
            <span>
              Transakcijos: +{paymentStats.added}, dublikatai:{" "}
              {paymentStats.skipped}
            </span>
          )}
          {invoiceStats && (
            <span>
              Sąskaitos: +{invoiceStats.added}, dublikatai:{" "}
              {invoiceStats.skipped}
            </span>
          )}
          {hasRates && (
            <span className="text-green-600">
              Kursai užkrauti ({rates.length} įrašų)
            </span>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      <QuickConverter rates={rates} />

      {hasBoth && hasRates && (
        <Card title="Palyginimas">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-sm text-gray-500">Pagal mokėjimo datą</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {fmt(totalPaymentEur)}
              </p>
              <p className="text-xs text-gray-400">EUR</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-sm text-gray-500">Pagal sąskaitos datą</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {fmt(totalInvoiceEur)}
              </p>
              <p className="text-xs text-gray-400">EUR</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-sm text-gray-500">Skirtumas</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {fmt(Math.abs(totalPaymentEur - totalInvoiceEur))}
              </p>
              <p className="mt-1 text-sm font-medium text-green-700">
                Geriau:{" "}
                {totalPaymentEur <= totalInvoiceEur
                  ? "pagal mokėjimo datą"
                  : "pagal sąskaitos datą"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {hasAny && (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            <button
              onClick={() => setTab("payment")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === "payment"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Pagal mokėjimo datą
              {yearPayments.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({yearPayments.length})
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("invoice")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === "invoice"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Pagal sąskaitos datą
              {yearInvoices.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({yearInvoices.length})
                </span>
              )}
            </button>
          </div>

          {activeMissing.length > 0 &&
            activeMissing.length < 12 &&
            activeData.length > 0 && (
              <Card>
                <div className="flex items-start gap-2 text-amber-700">
                  <span className="mt-0.5 text-lg">!</span>
                  <div>
                    <p className="font-medium">
                      Trūksta transakcijų šiems mėnesiams:
                    </p>
                    <p className="text-sm">
                      {activeMissing
                        .map((m) => MONTH_NAMES[m - 1])
                        .join(", ")}
                    </p>
                  </div>
                </div>
              </Card>
            )}

          {activeData.length > 0 ? (
            <Card>
              <Table
                data={activeData}
                columns={makeColumns(activeCurrency)}
                keyFn={(t) => t.id}
                emptyMessage="Nėra transakcijų"
              />
              <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
                <table className="text-sm">
                  <tbody>
                    <tr>
                      <td className="pr-4 text-right font-medium text-gray-600">
                        Viso ({activeCurrency}):
                      </td>
                      <td className="text-right font-bold">
                        {fmt(activeTotal)}
                      </td>
                    </tr>
                    {hasRates && (
                      <tr>
                        <td className="pr-4 text-right font-medium text-gray-600">
                          Viso (EUR):
                        </td>
                        <td className="text-right font-bold">
                          {fmt(activeTotalEur)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="py-4 text-center text-gray-500">
                {tab === "payment"
                  ? "Importuokite transakcijų CSV"
                  : "Importuokite sąskaitų CSV"}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
