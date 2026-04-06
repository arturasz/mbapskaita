import type { Expense, Currency, ExpenseCategory } from "../types";
import { convertToEur } from "./currency";

/**
 * Parse a generic expense CSV and convert to Expense records.
 * Automatically fetches ECB exchange rates for non-EUR currencies.
 *
 * Expected columns (flexible name matching, order may vary):
 * - Date, Description, Amount, Currency, Category
 * - Optional: VAT Deductible, VAT Amount
 */
export async function parseExpenseCSV(csvText: string): Promise<Expense[]> {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  const dateIdx = findCol(headers, ["date", "data", "expense date", "expense_date"]);
  const descIdx = findCol(headers, [
    "description",
    "aprašymas",
    "memo",
    "note",
    "notes",
    "name",
  ]);
  const amountIdx = findCol(headers, ["amount", "suma", "total", "cost", "price"]);
  const currencyIdx = findCol(headers, ["currency", "valiuta", "ccy"]);
  const categoryIdx = findCol(headers, [
    "category",
    "kategorija",
    "type",
    "expense type",
    "expense_type",
  ]);
  const vatDeductIdx = findCol(headers, [
    "vat deductible",
    "vat_deductible",
    "pvm atskaitomas",
  ]);
  const vatAmountIdx = findCol(headers, [
    "vat amount",
    "vat_amount",
    "vat",
    "pvm suma",
    "pvm",
  ]);

  if (amountIdx === -1 || dateIdx === -1) {
    throw new Error(
      "Neatpažintas CSV formatas. Tikimasi stulpelių: date, amount. " +
        `Rasti: ${headers.join(", ")}`,
    );
  }

  const expenses: Expense[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue;

    const rawAmount = parseFloat(
      row[amountIdx]?.replace(/[^0-9.\-]/g, "") ?? "0",
    );
    if (rawAmount === 0) continue;
    const amount = Math.abs(rawAmount);

    const currency = normalizeCurrency(row[currencyIdx]?.trim() ?? "EUR");
    const date = normalizeDate(row[dateIdx]?.trim() ?? "");
    if (!date) continue;

    const category = normalizeCategory(row[categoryIdx]?.trim() ?? "");
    const vatDeductible = parseVatDeductible(row[vatDeductIdx]?.trim());
    const vatAmountRaw = vatAmountIdx !== -1 ? parseFloat(row[vatAmountIdx] ?? "") : NaN;

    const amountEur = await convertToEur(amount, currency, date);

    expenses.push({
      id: crypto.randomUUID(),
      date,
      description: row[descIdx]?.trim() ?? "",
      amount,
      currency,
      amountEur,
      category,
      vatDeductible,
      vatAmount: isNaN(vatAmountRaw) ? undefined : Math.abs(vatAmountRaw),
    });
  }

  return expenses;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeCurrency(raw: string): Currency {
  const upper = raw.toUpperCase();
  if (upper === "EUR" || upper === "USD" || upper === "GBP") return upper;
  return "EUR";
}

function normalizeDate(raw: string): string {
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy)
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  // DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy)
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

const CATEGORY_MAP: Record<string, ExpenseCategory> = {
  office: "office",
  biuras: "office",
  rent: "office",
  equipment: "equipment",
  įranga: "equipment",
  hardware: "equipment",
  software: "software",
  "programinė įranga": "software",
  saas: "software",
  subscription: "software",
  subscriptions: "software",
  travel: "travel",
  kelionės: "travel",
  transport: "travel",
  communication: "communication",
  ryšiai: "communication",
  phone: "communication",
  internet: "communication",
  banking: "banking",
  bankininkystė: "banking",
  bank: "banking",
  fees: "banking",
  professional_services: "professional_services",
  "profesinės paslaugos": "professional_services",
  consulting: "professional_services",
  legal: "professional_services",
  accounting: "professional_services",
  other: "other",
  kita: "other",
};

function normalizeCategory(raw: string): ExpenseCategory {
  const lower = raw.toLowerCase();
  return CATEGORY_MAP[lower] ?? "other";
}

function parseVatDeductible(raw: string | undefined): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return lower === "true" || lower === "yes" || lower === "taip" || lower === "1";
}
