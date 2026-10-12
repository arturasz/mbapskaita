import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { FileImport } from "../../components/FileImport";
import { useIncomeStore } from "../../stores/income-store";
import { useInvestmentStore } from "../../stores/investment-store";
import { useDividendStore } from "../../stores/dividend-store";
import { useWiseStore } from "../../stores/wise-store";
import { useSyncStore } from "../../stores/sync-store";
import { fetchInbox, importWiseFiles, syncDeel, syncIbkr } from "../../lib/sync-actions";
import { isStale, lastSyncLabel, SYNC_LABELS, type SyncSource } from "../../lib/sync-status";

const RUNNERS: Partial<Record<SyncSource, () => Promise<string>>> = {
  deel: () => syncDeel(),
  ibkr: () => syncIbkr(),
};
const BUTTONS: Record<SyncSource, string> = {
  deel: "Importuoti",
  ibkr: "Gauti iš IBKR",
  wise: "",
};
const STALE_DAYS = 35;
const WISE_STATEMENT_URL = "https://wise.com/balances/statements/balance-statement?referrer=%2Fyour-account";

export function SyncPage() {
  const { times, loaded, hydrate } = useSyncStore();
  const [busy, setBusy] = useState<SyncSource | null>(null);
  const [results, setResults] = useState<Partial<Record<SyncSource, { ok: boolean; text: string }>>>({});
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!loaded) hydrate();
    // Stores must be loaded before a sync merges into them.
    const income = useIncomeStore.getState();
    if (!income.loaded) income.hydrate();
    const inv = useInvestmentStore.getState();
    if (!inv.loaded) inv.hydrate();
    const div = useDividendStore.getState();
    if (!div.loaded) div.hydrate();
    const wise = useWiseStore.getState();
    if (!wise.loaded) wise.hydrate();
    fetchInbox().then((items) => setWaiting(items.length));
  }, [loaded, hydrate]);

  const run = async (source: SyncSource) => {
    setBusy(source);
    try {
      const text = await RUNNERS[source]!();
      setResults((r) => ({ ...r, [source]: { ok: true, text } }));
      if (source === "deel") setWaiting(0);
    } catch (e) {
      setResults((r) => ({ ...r, [source]: { ok: false, text: (e as Error).message } }));
    } finally {
      setBusy(null);
    }
  };

  const importWise = async (files: File[]) => {
    try {
      const text = await importWiseFiles(files);
      setResults((r) => ({ ...r, wise: { ok: true, text } }));
    } catch (e) {
      setResults((r) => ({ ...r, wise: { ok: false, text: (e as Error).message } }));
    }
  };

  const now = new Date();
  const sources = Object.keys(SYNC_LABELS) as SyncSource[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Sinchronizacija</h1>
      <Card title="Duomenų šaltiniai">
        <ul className="divide-y divide-gray-100">
          {sources.map((s) => {
            const res = results[s];
            return (
              <li key={s} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                <div className="min-w-56 flex-1">
                  <div className="font-medium text-gray-900">{SYNC_LABELS[s]}</div>
                  <div className={`text-sm ${isStale(times[s], now, STALE_DAYS) ? "text-amber-700" : "text-gray-600"}`}>
                    Paskutinis kartas: {lastSyncLabel(times[s], now)}
                  </div>
                  {s === "deel" && waiting > 0 && (
                    <div className="text-sm text-blue-700">Laukia sąskaitų: {waiting}</div>
                  )}
                  {res && <div className={`text-sm ${res.ok ? "text-green-700" : "text-red-600"}`}>{res.text}</div>}
                </div>
                {s === "wise" ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <a href={WISE_STATEMENT_URL} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                      Atsisiųsti ataskaitą iš Wise
                    </a>
                    <FileImport label="Wise CSV" accept=".csv" onFiles={importWise} />
                  </div>
                ) : (
                  <button
                    onClick={() => run(s)}
                    disabled={busy !== null}
                    className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
                  >
                    {busy === s ? "Vyksta…" : BUTTONS[s]}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-gray-500">
          Rankinis failų įkėlimas (CSV, PDF) lieka Pajamų, Išlaidų ir Investicijų puslapiuose.
        </p>
      </Card>
    </div>
  );
}
