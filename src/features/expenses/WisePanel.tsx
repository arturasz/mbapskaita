import { useEffect, useRef, useState } from "react";
import { Card } from "../../components/Card";
import { useExpenseStore } from "../../stores/expense-store";
import { useWiseStore } from "../../stores/wise-store";
import { findPaymentForReceipt, findReceipt } from "../../lib/import-wise";
import type { WiseKind, WisePayment } from "../../lib/import-wise";
import { asCategory, asCurrency, uploadReceipt } from "../../lib/receipt-upload";
import type { UploadedReceipt } from "../../lib/receipt-upload";
import { convertToEur } from "../../lib/currency";
import type { Expense } from "../../types";
import { useSettingsStore } from "../../stores/settings-store";
import { guessVatKind, invoiceVatNote, receiptFor } from "../../lib/pvm101";
import type { VatKind } from "../../lib/pvm101";

const otherLabels: Record<Exclude<WiseKind, "card">, string> = {
  investment: "Pervedimai į IBKR",
  tax: "Mokesčiai / Sodra",
  conversion: "Valiutos keitimas",
  fee: "Wise komisiniai",
  other: "Kiti pervedimai",
};

const money = (p: WisePayment) =>
  p.merchantCurrency ? `${p.merchantAmount!.toFixed(2)} ${p.merchantCurrency}` : `${p.amount.toFixed(2)} ${p.currency}`;

export function WisePanel() {
  const { payments, decisions, vatKinds, loaded, hydrate, ignore, link, clearDecision, setVatKind } = useWiseStore();
  const pvmFrom = useSettingsStore((s) => s.settings.pvmRegisteredFrom);
  const { expenses, loaded: expensesLoaded, hydrate: hydrateExpenses, add } = useExpenseStore();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dropInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded) hydrate();
    if (!expensesLoaded) hydrateExpenses();
  }, [loaded, hydrate, expensesLoaded, hydrateExpenses]);

  const say = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(null), 8000);
  };

  const cards = payments.filter((p) => p.kind === "card");
  const hasReceipt = (p: WisePayment) => {
    const d = decisions[p.id];
    if (d?.status === "linked" && expenses.some((e) => e.id === d.expenseId)) return true;
    return !!findReceipt(p, expenses);
  };
  const isIgnored = (p: WisePayment) => decisions[p.id]?.status === "ignored";
  const matched = cards.filter(hasReceipt);
  const ignored = cards.filter((p) => !hasReceipt(p) && isIgnored(p));
  const missing = cards.filter((p) => !hasReceipt(p) && !isIgnored(p));

  // Receipts that no payment uses yet, offered for manual linking.
  const usedExpenseIds = new Set(
    Object.values(decisions).flatMap((d) => (d.status === "linked" ? [d.expenseId] : [])),
  );
  const freeReceipts = expenses.filter(
    (e) => e.fileId && !usedExpenseIds.has(e.id) && !cards.some((p) => findReceipt(p, [e])),
  );

  // The Wise row is the source of truth for date and amount, so the new expense always matches it.
  const attach = async (p: WisePayment, up: UploadedReceipt) => {
    const x = up.extracted ?? {};
    const currency = p.merchantCurrency ? asCurrency(p.merchantCurrency) : asCurrency(p.currency);
    const useMerchant = p.merchantCurrency !== undefined && asCurrency(p.merchantCurrency) === p.merchantCurrency;
    const amount = useMerchant ? p.merchantAmount! : p.amount;
    const expense: Expense = {
      id: crypto.randomUUID(),
      date: p.date,
      description: [x.vendor, x.description].filter((v) => typeof v === "string" && v).join(" — ") || p.counterparty,
      amount,
      currency: useMerchant ? currency : asCurrency(p.currency),
      amountEur: 0,
      category: asCategory(x.category),
      vatDeductible: false, // SVS payers cannot deduct input PVM
      vatAmount: typeof x.vatAmount === "number" ? x.vatAmount : undefined,
      fileId: up.fileId,
    };
    expense.amountEur = expense.currency === "EUR" ? amount : await convertToEur(amount, expense.currency, p.date);
    await add(expense);
    await link(p.id, expense.id);
  };

  const attachFile = async (p: WisePayment, file: File) => {
    setBusy(true);
    try {
      await attach(p, await uploadReceipt(file));
      say(`Čekis pridėtas: ${p.counterparty}`);
    } catch (err) {
      say(`Klaida: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const dropFiles = async (files: File[]) => {
    setBusy(true);
    const notes: string[] = [];
    let open = missing;
    for (const file of files) {
      try {
        const up = await uploadReceipt(file);
        const x = up.extracted;
        const found =
          x && typeof x.date === "string" && typeof x.amount === "number"
            ? findPaymentForReceipt({ date: x.date, amount: x.amount, currency: asCurrency(x.currency) }, open)
            : undefined;
        if (found) {
          await attach(found, up);
          open = open.filter((p) => p !== found);
          notes.push(`${file.name} → ${found.counterparty}`);
        } else {
          notes.push(`${file.name}: nepavyko priskirti${up.extracted ? "" : " (čekis neperskaitytas)"} — naudokite „Pridėti čekį“ prie eilutės`);
        }
      } catch (err) {
        notes.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setBusy(false);
    say(notes.join(" · "));
  };

  const others = Object.entries(otherLabels)
    .map(([kind, label]) => {
      const rows = payments.filter((p) => p.kind === kind);
      const totals = new Map<string, number>();
      rows.forEach((p) => totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount));
      return { label, count: rows.length, totals: [...totals].map(([c, v]) => `${v.toFixed(2)} ${c}`).join(", ") };
    })
    .filter((o) => o.count > 0);

  const btn = "text-sm text-blue-600 hover:text-blue-800";

  // Card payments since PVM registration that are not obviously Lithuanian: the user confirms the kind.
  const foreign = pvmFrom
    ? cards
        .filter((p) => p.date >= pvmFrom)
        .map((p) => {
          const d = decisions[p.id];
          const receipt = receiptFor(p, expenses, d?.status === "linked" ? d.expenseId : undefined);
          const guess = guessVatKind(p, receipt);
          return { p, kind: vatKinds[p.id] ?? guess, guess, receipt };
        })
        .filter((x) => x.guess !== "local" || vatKinds[x.p.id])
    : [];

  return (
    <Card title="Wise išlaidos ir čekiai">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-500">Wise CSV įkelkite puslapyje „Sinchronizacija“.</span>
        {cards.length > 0 && (
          <span className="text-gray-600">
            Kortelės mokėjimai: {cards.length} · su čekiu {matched.length} · be čekio{" "}
            <b className={missing.length ? "text-red-600" : "text-green-700"}>{missing.length}</b> · praleista {ignored.length}
          </span>
        )}
      </div>

      {status && <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-800">{status}</div>}

      {missing.length > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            dropFiles([...e.dataTransfer.files]);
          }}
          onClick={() => dropInput.current?.click()}
          className={`mb-4 cursor-pointer rounded-md border-2 border-dashed p-4 text-center text-sm ${
            dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 text-gray-500"
          }`}
        >
          {busy ? "Kraunama…" : "Įmeskite čekius čia: bandysiu automatiškai priskirti prie Wise eilutės"}
          <input
            ref={dropInput}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              dropFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {missing.length === 0 && (
        <p className="text-sm text-gray-500">
          {cards.length ? "Visi kortelės mokėjimai turi čekius" : "Importuokite Wise išrašą (CSV)"}
        </p>
      )}

      <ul className="divide-y divide-gray-100">
        {missing.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            <span className="w-24 text-gray-500">{p.date}</span>
            <span className="min-w-0 flex-1 truncate">{p.counterparty}</span>
            <span className="w-28 text-right font-medium">{money(p)}</span>
            <label className={`${btn} cursor-pointer`}>
              Pridėti čekį
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) attachFile(p, f);
                  e.target.value = "";
                }}
              />
            </label>
            {freeReceipts.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && link(p.id, e.target.value)}
                className="max-w-44 rounded-md border border-gray-300 px-1 py-0.5 text-xs"
              >
                <option value="">Susieti su esamu…</option>
                {freeReceipts.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.date} · {e.description.slice(0, 24)} · {e.amount.toFixed(2)} {e.currency}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => {
                const note = window.prompt("Kodėl čekio nereikia? (pvz. asmeninė išlaida)");
                if (note) ignore(p.id, note);
              }}
              className={btn}
            >
              Čekio nėra
            </button>
          </li>
        ))}
      </ul>

      {ignored.length > 0 && (
        <details className="mt-4 text-sm text-gray-600">
          <summary className="cursor-pointer">Praleisti ({ignored.length})</summary>
          <ul className="mt-2 space-y-1">
            {ignored.map((p) => {
              const d = decisions[p.id];
              return (
                <li key={p.id}>
                  {p.date} · {p.counterparty} · {money(p)} — {d.status === "ignored" ? d.note : ""}{" "}
                  <button onClick={() => clearDecision(p.id)} className="text-blue-600">
                    atšaukti
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {foreign.length > 0 && (
        <details className="mt-4 text-sm" open>
          <summary className="cursor-pointer font-medium text-gray-700">
            Užsienio pirkimai nuo PVM registracijos ({foreign.length}) — nuo jų priklauso PVM101
          </summary>
          <ul className="mt-2 space-y-1">
            {foreign.map(({ p, kind, receipt }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-gray-500">{p.date}</span>
                <span className="min-w-0 flex-1 truncate">{p.counterparty}</span>
                <span className="w-28 text-right">{money(p)}</span>
                <span className="w-44 text-xs text-gray-500">{invoiceVatNote(receipt)}</span>
                <select
                  value={kind}
                  onChange={(e) => setVatKind(p.id, e.target.value as VatKind)}
                  className="rounded-md border border-gray-300 px-1 py-0.5 text-xs"
                >
                  <option value="service">Užsienio paslauga</option>
                  <option value="goods">Prekė</option>
                  <option value="local">Vietinis / PVM jau sąskaitoje</option>
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}

      {others.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-gray-600">
          {others.map((o) => (
            <li key={o.label}>
              {o.label}: {o.count} · {o.totals}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
