import type { Income, Currency, IncomeSourceCountry } from "../types";
import { convertToEur } from "./currency";

/**
 * Parse Deel invoice CSV export and convert to Income records.
 * Automatically fetches ECB exchange rates for USD→EUR conversion.
 *
 * Expected Deel CSV columns (order may vary):
 * - Invoice Number, Contract Name, Client Name, Client Country,
 *   Currency, Amount, Status, Invoice Date, Due Date, Paid Date
 *
 * Only "Paid" invoices are imported.
 */
export async function parseDeelCSV(csvText: string): Promise<Income[]> {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  const invoiceNumIdx = findCol(headers, ["invoice number", "invoice_number", "invoice"]);
  const clientIdx = findCol(headers, ["client name", "client_name", "client"]);
  const clientCountryIdx = findCol(headers, ["client country", "client_country", "country"]);
  const currencyIdx = findCol(headers, ["currency"]);
  const amountIdx = findCol(headers, ["amount", "total", "total amount"]);
  const statusIdx = findCol(headers, ["status"]);
  const dateIdx = findCol(headers, ["invoice date", "invoice_date", "date", "paid date", "paid_date"]);
  const descIdx = findCol(headers, ["contract name", "contract_name", "description", "contract"]);

  if (amountIdx === -1 || dateIdx === -1) {
    throw new Error(
      "Neatpažintas Deel CSV formatas. Tikimasi stulpelių: amount, date. " +
        `Rasti: ${headers.join(", ")}`,
    );
  }

  const incomes: Income[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 2) continue;

    const status = statusIdx !== -1 ? row[statusIdx]?.trim().toLowerCase() : "paid";
    if (status !== "paid" && status !== "") continue;

    const rawAmount = parseFloat(row[amountIdx]?.replace(/[^0-9.\-]/g, "") ?? "0");
    if (rawAmount <= 0) continue;

    const currency = normalizeCurrency(row[currencyIdx]?.trim() ?? "USD");
    const date = normalizeDate(row[dateIdx]?.trim() ?? "");
    if (!date) continue;

    const clientCountry = row[clientCountryIdx]?.trim() ?? "";
    const sourceCountry = mapCountryToSource(clientCountry);

    const amountEur = await convertToEur(rawAmount, currency, date);

    incomes.push({
      id: crypto.randomUUID(),
      date,
      description: row[descIdx]?.trim() ?? "Deel invoice",
      amount: rawAmount,
      currency,
      amountEur,
      category: "services",
      client: row[clientIdx]?.trim() ?? "Deel",
      sourceCountry,
      invoiceNumber: row[invoiceNumIdx]?.trim() ?? undefined,
    });
  }

  return incomes;
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
  return "USD";
}

function normalizeDate(raw: string): string {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // Try MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  // Try DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

function mapCountryToSource(country: string): IncomeSourceCountry {
  const upper = country.toUpperCase().trim();
  if (upper === "LT" || upper === "LITHUANIA" || upper === "LIETUVA") return "LT";
  if (upper === "US" || upper === "USA" || upper === "UNITED STATES") return "US";
  if (upper === "GB" || upper === "UK" || upper === "UNITED KINGDOM") return "GB";
  if (upper === "DE" || upper === "GERMANY" || upper === "VOKIETIJA") return "DE";
  return "Other";
}
