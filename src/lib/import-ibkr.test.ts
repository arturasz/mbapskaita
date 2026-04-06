import { describe, it, expect, vi } from "vitest";
import { parseIBKRActivityStatement } from "./import-ibkr";

// Mock the currency module
vi.mock("./currency", () => ({
  convertToEur: vi.fn(async (amount: number, from: string) => {
    if (from === "EUR") return amount;
    const rates: Record<string, number> = { USD: 0.92, GBP: 1.17 };
    return Math.round(amount * (rates[from] ?? 1) * 100) / 100;
  }),
}));

const sampleCSV = `Statement,Header,Field Name,Field Value
Statement,Data,Title,Activity Statement
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,EUR,VWCE,2026-01-15 10:30:00,10,105.50,106.00,-1055.00,-1.00,1056.00,0.00,5.00,O
Trades,Data,Order,Stocks,EUR,VWCE,2026-06-20 14:00:00,-5,120.00,120.00,600.00,-1.00,528.00,71.00,0.00,C
Trades,Data,SubTotal,,EUR,,,,,,,-2.00,,,5.00,
Deposits,Header,Currency,Amount
Deposits,Data,EUR,10000`;

describe("parseIBKRActivityStatement", () => {
  it("parses buy and sell trades", async () => {
    const result = await parseIBKRActivityStatement(sampleCSV);
    expect(result).toHaveLength(2);
  });

  it("maps buy trade correctly", async () => {
    const result = await parseIBKRActivityStatement(sampleCSV);
    const buy = result[0];
    expect(buy.asset).toBe("VWCE");
    expect(buy.purchaseDate).toBe("2026-01-15");
    expect(buy.quantity).toBe(10);
    expect(buy.currency).toBe("EUR");
    expect(buy.broker).toBe("IBKR");
    expect(buy.saleDate).toBeUndefined();
  });

  it("converts EUR amounts correctly (passthrough)", async () => {
    const result = await parseIBKRActivityStatement(sampleCSV);
    const buy = result[0];
    // EUR→EUR = same amount
    expect(buy.purchasePriceEur).toBe(buy.purchasePrice);
  });

  it("maps sell trade correctly", async () => {
    const result = await parseIBKRActivityStatement(sampleCSV);
    const sell = result[1];
    expect(sell.asset).toBe("VWCE");
    expect(sell.saleDate).toBe("2026-06-20");
    expect(sell.quantity).toBe(5);
    expect(sell.salePriceEur).toBe(600);
  });

  it("skips subtotal rows", async () => {
    const result = await parseIBKRActivityStatement(sampleCSV);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", async () => {
    expect(await parseIBKRActivityStatement("")).toEqual([]);
  });

  it("auto-converts USD trades to EUR", async () => {
    const csv = `Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,AAPL,2026-03-15,2,180.00,180.00,-360.00,-0.50,360.50,0.00,0.00,O`;
    const result = await parseIBKRActivityStatement(csv);
    expect(result[0].purchaseDate).toBe("2026-03-15");
    // (360 + 0.5) * 0.92 = 331.66
    expect(result[0].purchasePriceEur).toBe(331.66);
  });
});
