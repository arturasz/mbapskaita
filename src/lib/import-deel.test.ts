import { describe, it, expect, vi } from "vitest";
import { parseDeelCSV } from "./import-deel";

// Mock the currency module to avoid real API calls
vi.mock("./currency", () => ({
  convertToEur: vi.fn(async (amount: number, from: string) => {
    if (from === "EUR") return amount;
    // Fake rate: 1 USD = 0.92 EUR, 1 GBP = 1.17 EUR
    const rates: Record<string, number> = { USD: 0.92, GBP: 1.17 };
    return Math.round(amount * (rates[from] ?? 1) * 100) / 100;
  }),
}));

const sampleCSV = `Invoice Number,Contract Name,Client Name,Client Country,Currency,Amount,Status,Invoice Date
INV-001,Dev Services,Acme Corp,US,USD,5000.00,Paid,2026-01-15
INV-002,Consulting,Beta GmbH,DE,EUR,3000.00,Paid,2026-02-20
INV-003,Support,Gamma Ltd,GB,GBP,2000.00,Pending,2026-03-10
INV-004,Dev Work,Local UAB,Lithuania,EUR,1500.00,Paid,2026-03-25`;

describe("parseDeelCSV", () => {
  it("parses paid invoices", async () => {
    const result = await parseDeelCSV(sampleCSV);
    // Only 3 paid invoices (INV-003 is Pending)
    expect(result).toHaveLength(3);
  });

  it("maps fields correctly", async () => {
    const result = await parseDeelCSV(sampleCSV);
    const first = result[0];
    expect(first.invoiceNumber).toBe("INV-001");
    expect(first.client).toBe("Acme Corp");
    expect(first.sourceCountry).toBe("US");
    expect(first.currency).toBe("USD");
    expect(first.amount).toBe(5000);
    expect(first.date).toBe("2026-01-15");
    expect(first.category).toBe("services");
  });

  it("auto-converts USD to EUR", async () => {
    const result = await parseDeelCSV(sampleCSV);
    const usdInvoice = result.find((r) => r.currency === "USD");
    // 5000 * 0.92 = 4600
    expect(usdInvoice?.amountEur).toBe(4600);
  });

  it("maps country codes to sourceCountry", async () => {
    const result = await parseDeelCSV(sampleCSV);
    expect(result[0].sourceCountry).toBe("US");
    expect(result[1].sourceCountry).toBe("DE");
    expect(result[2].sourceCountry).toBe("LT");
  });

  it("sets amountEur directly for EUR invoices", async () => {
    const result = await parseDeelCSV(sampleCSV);
    const eurInvoice = result.find((r) => r.currency === "EUR" && r.amount === 3000);
    expect(eurInvoice?.amountEur).toBe(3000);
  });

  it("handles empty CSV", async () => {
    expect(await parseDeelCSV("")).toEqual([]);
    expect(await parseDeelCSV("Header1,Header2\n")).toEqual([]);
  });

  it("handles MM/DD/YYYY date format", async () => {
    const csv = `Amount,Date,Status\n1000,01/15/2026,Paid`;
    const result = await parseDeelCSV(csv);
    expect(result[0].date).toBe("2026-01-15");
  });
});
