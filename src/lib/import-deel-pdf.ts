import type { Income, Currency, IncomeSourceCountry } from "../types";
import { convertToEur } from "./currency";
import { extractPDFFullText } from "./pdf";

/**
 * Parse a Deel invoice PDF into an Income record.
 * Each Deel PDF is a single invoice.
 *
 * Extracts from text patterns:
 * - Invoice number: "Invoice INV-XXXX" or "Invoice #XXXX"
 * - Amount: "$X,XXX.XX" or "USD X,XXX.XX" or "Total X,XXX.XX"
 * - Date: various formats near "Invoice Date", "Date", "Issued"
 * - Client: near "Bill To" or "Client"
 */
export async function parseDeelPDF(file: File): Promise<Income | null> {
  const text = await extractPDFFullText(file);
  return parseDeelInvoiceText(text);
}

export async function parseDeelInvoiceText(
  text: string,
): Promise<Income | null> {
  const invoiceNumber = extractInvoiceNumber(text);
  const amount = extractAmount(text);
  const currency = extractCurrency(text);
  const date = extractDate(text);
  const client = extractClient(text);

  if (!amount || !date) return null;

  const amountEur = await convertToEur(amount, currency, date);

  return {
    id: crypto.randomUUID(),
    date,
    description: `Deel invoice${invoiceNumber ? ` ${invoiceNumber}` : ""}`,
    amount,
    currency,
    amountEur,
    category: "services",
    client: client ?? "Deel",
    sourceCountry: guessCountry(text),
    invoiceNumber: invoiceNumber ?? undefined,
  };
}

function extractInvoiceNumber(text: string): string | null {
  // "Invoice INV-001" or "Invoice #001" or "Invoice Number: INV-001"
  const match = text.match(
    /Invoice\s+(?:Number\s*[:.]?\s*)?#?\s*(INV[-\s]?\d+[\w-]*)/i,
  );
  if (match) return match[1].trim();

  // Standalone "INV-XXXX" pattern
  const inv = text.match(/\b(INV[-\s]?\d{3,}[\w-]*)\b/i);
  return inv ? inv[1].trim() : null;
}

function extractAmount(text: string): number | null {
  // Try "Total $5,000.00" or "Amount $5,000.00" or "Total Due $5,000.00"
  const totalMatch = text.match(
    /(?:Total|Amount|Total\s+Due|Grand\s+Total)\s*[:.]?\s*\$?\s*([\d,]+\.?\d*)/i,
  );
  if (totalMatch) return parseAmount(totalMatch[1]);

  // Try "$5,000.00" standalone
  const dollarMatch = text.match(/\$([\d,]+\.\d{2})/);
  if (dollarMatch) return parseAmount(dollarMatch[1]);

  // Try "USD 5,000.00" or "5,000.00 USD"
  const usdMatch = text.match(
    /(?:USD\s+)([\d,]+\.?\d*)|(?:([\d,]+\.?\d*)\s+USD)/i,
  );
  if (usdMatch) return parseAmount(usdMatch[1] ?? usdMatch[2]);

  return null;
}

function extractCurrency(text: string): Currency {
  if (/\bEUR\b/.test(text)) return "EUR";
  if (/\bGBP\b|£/.test(text)) return "GBP";
  return "USD"; // default for Deel
}

function extractDate(text: string): string | null {
  // Try "Invoice Date: Jan 15, 2026" or "Date: 2026-01-15" etc.
  const patterns = [
    // ISO: 2026-01-15
    /(\d{4}-\d{2}-\d{2})/,
    // "Jan 15, 2026" or "January 15, 2026"
    /(\w{3,9}\s+\d{1,2},?\s+\d{4})/,
    // MM/DD/YYYY
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    // DD.MM.YYYY
    /(\d{1,2}\.\d{1,2}\.\d{4})/,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) return normalizeDate(match[1]);
  }

  return null;
}

function extractClient(text: string): string | null {
  // "Bill To: Company Name" or "Client: Company Name"
  const match = text.match(
    /(?:Bill\s+To|Client|Billed\s+To|Customer)\s*[:.]?\s*([A-Z][\w\s&.,'-]{2,40})/i,
  );
  return match ? match[1].trim() : null;
}

function guessCountry(text: string): IncomeSourceCountry {
  const upper = text.toUpperCase();
  if (/\bUNITED\s+STATES\b|\bUSA\b|\bU\.S\.A\b/.test(upper)) return "US";
  if (/\bUNITED\s+KINGDOM\b|\bLONDON\b/.test(upper)) return "GB";
  if (/\bGERMANY\b|\bDEUTSCHLAND\b|\bBERLIN\b/.test(upper)) return "DE";
  if (/\bLITHUANIA\b|\bLIETUVA\b|\bVILNIUS\b/.test(upper)) return "LT";
  return "US"; // default for Deel — most likely US client
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function normalizeDate(raw: string): string {
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  // DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  // "Jan 15, 2026" or "January 15 2026"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const named = raw.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const m = months[named[1].toLowerCase().slice(0, 3)];
    if (m) return `${named[3]}-${m}-${named[2].padStart(2, "0")}`;
  }

  return raw;
}
