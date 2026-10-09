export interface Transaction {
  id: string;
  date: string;
  currency: string;
  amount: number;
  client: string;
  amountEur?: number;
  rate?: number;
  rateDate?: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy)
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy)
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

function findCol(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) =>
    candidates.some((c) => h.toLowerCase().trim() === c.toLowerCase()),
  );
}

/** Parse Deel transactions CSV (payment dates). */
export function parseTransactionCSV(text: string): Transaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const idIdx = findCol(headers, ["ID"]);
  const dateIdx = findCol(headers, ["Date Requested"]);
  const statusIdx = findCol(headers, ["Transaction Status"]);
  const typeIdx = findCol(headers, ["Transaction Type"]);
  const currencyIdx = findCol(headers, ["Currency"]);
  const amountIdx = findCol(headers, ["Transaction Amount"]);
  const clientIdx = findCol(headers, ["Client"]);

  if (dateIdx < 0 || amountIdx < 0) {
    throw new Error(
      "CSV formatas neatpažintas — trūksta datos arba sumos stulpelio",
    );
  }

  const transactions: Transaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    if (f.length <= Math.max(dateIdx, amountIdx)) continue;

    const status = statusIdx >= 0 ? f[statusIdx] : "completed";
    const type = typeIdx >= 0 ? f[typeIdx] : "client_payment";
    if (status !== "completed" || type !== "client_payment") continue;

    const amount = parseFloat(f[amountIdx]);
    if (isNaN(amount) || amount <= 0) continue;

    const date = normalizeDate(f[dateIdx]);
    if (!date) continue;

    transactions.push({
      id: idIdx >= 0 ? f[idIdx] : `txn-${date}-${amount}`,
      date,
      currency: currencyIdx >= 0 ? f[currencyIdx].toUpperCase() : "USD",
      amount,
      client: clientIdx >= 0 ? f[clientIdx] : "",
    });
  }

  return transactions;
}

/** Parse Deel invoices CSV (invoice dates). */
export function parseDeelInvoiceCSV(text: string): Transaction[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const idIdx = findCol(headers, ["Invoice Number", "Invoice_Number", "Invoice"]);
  const dateIdx = findCol(headers, [
    "Invoice Date",
    "Invoice_Date",
    "Date",
  ]);
  const statusIdx = findCol(headers, ["Status"]);
  const currencyIdx = findCol(headers, ["Currency"]);
  const amountIdx = findCol(headers, ["Amount", "Total", "Total Amount"]);
  const clientIdx = findCol(headers, [
    "Client Name",
    "Client_Name",
    "Client",
  ]);

  if (dateIdx < 0 || amountIdx < 0) {
    throw new Error(
      "Sąskaitų CSV formatas neatpažintas — trūksta datos arba sumos stulpelio",
    );
  }

  const transactions: Transaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    if (f.length <= Math.max(dateIdx, amountIdx)) continue;

    const status =
      statusIdx >= 0 ? f[statusIdx].trim().toLowerCase() : "paid";
    if (status !== "paid" && status !== "") continue;

    const rawAmount = f[amountIdx]?.replace(/[^0-9.\-]/g, "") ?? "0";
    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) continue;

    const date = normalizeDate(f[dateIdx]);
    if (!date) continue;

    transactions.push({
      id: idIdx >= 0 ? f[idIdx].trim() : `inv-${date}-${amount}`,
      date,
      currency: currencyIdx >= 0 ? f[currencyIdx].trim().toUpperCase() : "USD",
      amount,
      client: clientIdx >= 0 ? f[clientIdx].trim() : "",
    });
  }

  return transactions;
}

export function deduplicateTransactions(
  transactions: Transaction[],
): Transaction[] {
  const seen = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!seen.has(t.id)) seen.set(t.id, t);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function findMissingMonths(
  transactions: Transaction[],
  year: number,
): number[] {
  const months = new Set(
    transactions
      .filter((t) => t.date.startsWith(`${year}`))
      .map((t) => parseInt(t.date.split("-")[1], 10)),
  );
  const missing: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!months.has(m)) missing.push(m);
  }
  return missing;
}
