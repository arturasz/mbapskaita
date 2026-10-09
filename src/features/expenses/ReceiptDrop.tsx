import { useRef, useState } from "react";
import { Card } from "../../components/Card";
import { expenseCategories } from "../../data/expense-categories";
import { convertToEur } from "../../lib/currency";
import { useExpenseStore } from "../../stores/expense-store";
import type { Currency, ExpenseCategory } from "../../types";

interface Row {
  key: string;
  fileName: string;
  fileId: string | null;
  status: "reading" | "review" | "saved" | "error";
  message?: string;
  date: string;
  description: string;
  amount: string;
  currency: Currency;
  category: ExpenseCategory;
  vatAmount: string;
  vatDeductible: boolean;
}

const MAX_IMAGE_SIDE = 1800;

async function toBase64(file: File): Promise<{ contentType: string; dataBase64: string }> {
  if (file.type === "application/pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { contentType: file.type, dataBase64: btoa(binary) };
  }
  // Photos are shrunk first: phone cameras produce files larger than the upload limit.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { contentType: "image/jpeg", dataBase64: dataUrl.split(",")[1] };
}

const asCurrency = (raw: unknown): Currency =>
  raw === "USD" || raw === "GBP" ? raw : "EUR";

const asCategory = (raw: unknown): ExpenseCategory =>
  expenseCategories.some((c) => c.key === raw) ? (raw as ExpenseCategory) : "other";

export function ReceiptDrop() {
  const add = useExpenseStore((s) => s.add);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, change: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const readFile = async (file: File) => {
    const key = crypto.randomUUID();
    const base: Row = {
      key,
      fileName: file.name,
      fileId: null,
      status: "reading",
      date: new Date().toISOString().slice(0, 10),
      description: "",
      amount: "",
      currency: "EUR",
      category: "other",
      vatAmount: "",
      vatDeductible: true,
    };
    setRows((all) => [...all, base]);
    try {
      const payload = await toBase64(file);
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, ...payload }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
      const { fileId, extracted, extractError } = (await res.json()) as {
        fileId: string;
        extracted: Record<string, unknown> | null;
        extractError: string | null;
      };
      const x = extracted ?? {};
      patch(key, {
        fileId,
        status: "review",
        message: extracted ? undefined : `Nepavyko perskaityti (${extractError ?? "nežinoma klaida"}), užpildykite rankiniu būdu`,
        date: typeof x.date === "string" ? x.date : base.date,
        description: [x.vendor, x.description].filter((v) => typeof v === "string" && v).join(" — "),
        amount: typeof x.amount === "number" ? String(x.amount) : "",
        currency: asCurrency(x.currency),
        category: asCategory(x.category),
        vatAmount: typeof x.vatAmount === "number" ? String(x.vatAmount) : "",
        vatDeductible: x.hasVatInvoice === true,
      });
    } catch (err) {
      patch(key, { status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const save = async (row: Row) => {
    const amount = Number(row.amount);
    if (!row.fileId || !amount || !row.date) return patch(row.key, { message: "Trūksta datos arba sumos" });
    const amountEur = row.currency === "EUR" ? amount : await convertToEur(amount, row.currency, row.date);
    await add({
      id: crypto.randomUUID(),
      date: row.date,
      description: row.description || row.fileName,
      amount,
      currency: row.currency,
      amountEur,
      category: row.category,
      vatDeductible: row.vatDeductible,
      vatAmount: row.vatAmount ? Number(row.vatAmount) : undefined,
      fileId: row.fileId,
    });
    patch(row.key, { status: "saved", message: undefined });
  };

  const onFiles = (files: FileList | null) => {
    if (files) [...files].forEach(readFile);
  };

  const field = "rounded-md border border-gray-300 px-2 py-1 text-sm";

  return (
    <Card title="Čekiai ir sąskaitos">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center text-sm ${
          dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 text-gray-500"
        }`}
      >
        Įmeskite čekį ar sąskaitą čia (PDF arba nuotrauka) arba paspauskite, kad pasirinktumėte
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="rounded-md border border-gray-200 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between text-gray-500">
                <span>{r.fileName}</span>
                <span>
                  {r.status === "reading" && "Skaitoma…"}
                  {r.status === "saved" && "Išsaugota ✓"}
                  {r.status === "error" && "Klaida"}
                </span>
              </div>
              {r.message && <p className="mb-2 text-amber-700">{r.message}</p>}
              {r.status === "review" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <input type="date" value={r.date} onChange={(e) => patch(r.key, { date: e.target.value })} className={field} />
                  <input
                    value={r.description}
                    onChange={(e) => patch(r.key, { description: e.target.value })}
                    placeholder="Aprašymas"
                    className={`${field} col-span-2`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={r.amount}
                    onChange={(e) => patch(r.key, { amount: e.target.value })}
                    placeholder="Suma"
                    className={field}
                  />
                  <select value={r.currency} onChange={(e) => patch(r.key, { currency: e.target.value as Currency })} className={field}>
                    <option>EUR</option>
                    <option>USD</option>
                    <option>GBP</option>
                  </select>
                  <select value={r.category} onChange={(e) => patch(r.key, { category: e.target.value as ExpenseCategory })} className={field}>
                    {expenseCategories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.labelLt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={r.vatAmount}
                    onChange={(e) => patch(r.key, { vatAmount: e.target.value })}
                    placeholder="PVM"
                    className={field}
                  />
                  <label className="flex items-center gap-2 sm:col-span-2">
                    <input type="checkbox" checked={r.vatDeductible} onChange={(e) => patch(r.key, { vatDeductible: e.target.checked })} />
                    PVM atskaitomas
                  </label>
                  <button onClick={() => save(r)} className="rounded-md bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 sm:col-span-2">
                    Išsaugoti
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
