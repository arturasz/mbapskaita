import { describe, it, expect } from "vitest";
import { parseFlexCsv, applyFlexTrades, flexDividends } from "./import-ibkr-flex";
import type { ToEur } from "./import-ibkr-flex";

const TRADE_HEADER =
  "ClientAccountID,AssetClass,Symbol,CurrencyPrimary,TradeID,TradeDate,DateTime,Quantity,Proceeds,IBCommission,IBCommissionCurrency,Buy/Sell,TransactionID";
const CASH_HEADER = "ClientAccountID,Symbol,CurrencyPrimary,Date/Time,Amount,Type,Description,TransactionID";

const csv = (rows: string[]) => rows.join("\n");

const toEur: ToEur = async (amount) => amount * 0.5;

describe("parseFlexCsv", () => {
  it("splits blocks, keeps stock trades, ignores forex and the rate table", () => {
    const report = parseFlexCsv(
      csv([
        TRADE_HEADER,
        "U1,STK,VUSD,USD,t1,2026-04-02,2026-04-02;07:05:41,15,-1845,-4,USD,BUY,x1",
        "U1,CASH,EUR.USD,USD,t2,2026-04-02,2026-04-02;07:05:41,100,-110,0,USD,BUY,x2",
        CASH_HEADER,
        'U1,VUSD,USD,2026-07-01;20:20:00,47.4,Dividends,"VUSD CASH DIVIDEND, MIXED",c1',
        "Date/Time,FromCurrency,ToCurrency,Rate",
        "2025-10-09,CHF,USD,1.24",
      ]),
    );
    expect(report.trades).toHaveLength(1);
    expect(report.trades[0]).toMatchObject({ id: "x1", symbol: "VUSD", side: "BUY", quantity: 15, proceeds: 1845, commission: 4 });
    expect(report.cash).toHaveLength(1);
    expect(report.cash[0].description).toBe("VUSD CASH DIVIDEND, MIXED");
  });
});

describe("applyFlexTrades", () => {
  const trade = (id: string, date: string, side: "BUY" | "SELL", quantity: number, proceeds: number) => ({
    id,
    symbol: "VUSD",
    date,
    side,
    quantity,
    currency: "USD" as const,
    proceeds,
    commission: 1,
    commissionCurrency: "USD" as const,
  });

  it("creates lots from buys with commission included in cost", async () => {
    const { investments, added } = await applyFlexTrades([], [trade("b1", "2026-01-05", "BUY", 10, 1000)], toEur);
    expect(added).toBe(1);
    expect(investments[0]).toMatchObject({ purchasePrice: 1001, purchasePriceEur: 500.5, quantity: 10 });
  });

  it("sells FIFO and splits a partially sold lot", async () => {
    const trades = [
      trade("b1", "2026-01-05", "BUY", 10, 1000),
      trade("b2", "2026-02-05", "BUY", 10, 2000),
      trade("s1", "2026-03-01", "SELL", 15, 3000),
    ];
    const { investments, closed } = await applyFlexTrades([], trades, toEur);
    expect(closed).toBe(2);
    const sold = investments.filter((l) => l.saleDate);
    const open = investments.filter((l) => !l.saleDate);
    expect(sold.map((l) => l.quantity)).toEqual([10, 5]);
    expect(open).toHaveLength(1);
    expect(open[0].quantity).toBe(5);
    expect(open[0].purchaseDate).toBe("2026-02-05");
    // net sale 3000 - 1 commission, split by quantity (10/15 and 5/15), converted at 0.5
    expect(sold[0].salePriceEur).toBeCloseTo((2999 * 0.5 * 10) / 15, 6);
    expect(sold[1].salePriceEur).toBeCloseTo((2999 * 0.5 * 5) / 15, 6);
  });

  it("is idempotent when the same trades are applied twice", async () => {
    const trades = [trade("b1", "2026-01-05", "BUY", 10, 1000), trade("s1", "2026-03-01", "SELL", 4, 500)];
    const first = await applyFlexTrades([], trades, toEur);
    const second = await applyFlexTrades(first.investments, trades, toEur);
    expect(second.added).toBe(0);
    expect(second.closed).toBe(0);
    expect(second.investments).toHaveLength(first.investments.length);
  });

  it("warns when selling more than the open lots hold", async () => {
    const { warnings } = await applyFlexTrades([], [trade("s1", "2026-03-01", "SELL", 4, 500)], toEur);
    expect(warnings).toHaveLength(1);
  });
});

describe("flexDividends", () => {
  it("keeps dividends and withholding, drops deposits", async () => {
    const rows = [
      { id: "1", symbol: "VUSD", date: "2026-07-01", type: "Dividends", amount: 47.4, currency: "USD" as const, description: "" },
      { id: "2", symbol: "VUSD", date: "2026-07-01", type: "Withholding Tax", amount: -7.1, currency: "USD" as const, description: "" },
      { id: "3", symbol: "", date: "2026-03-16", type: "Deposits/Withdrawals", amount: 3998, currency: "USD" as const, description: "" },
    ];
    const out = await flexDividends(rows, toEur);
    expect(out.map((d) => d.kind)).toEqual(["dividend", "withholding"]);
    expect(out[0].amountEur).toBeCloseTo(23.7, 6);
  });
});
