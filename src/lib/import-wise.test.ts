import { describe, expect, it } from "vitest";
import { findReceipt, parseWiseCsv } from "./import-wise";
import type { Expense } from "../types";

const HEADER =
  '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"';

const row = (id: string, date: string, amount: string, cur: string, merchant: string, type: string, details: string) =>
  `${id},${date},"${date} 10:00:00.000",${amount},${cur},"Desc, with comma",,100,,,,,,,"${merchant}",1234,Name,,,0.00,,${type},${details}`;

const csv = [
  HEADER,
  row("CARD-1", "04-10-2026", "-20.00", "USD", "Link.com", "DEBIT", "CARD"),
  row("CARD-2", "04-10-2026", "-0.01", "USD", "Link.com", "DEBIT", "CARD"),
  row("TR-1", "03-05-2026", "-8074.35", "USD", "Interactive Brokers Ireland Limited", "DEBIT", "TRANSFER"),
  row("IN-1", "08-10-2026", "14750.00", "USD", "", "CREDIT", "DEPOSIT"),
].join("\n");

describe("parseWiseCsv", () => {
  const rows = parseWiseCsv(csv);

  it("keeps only money out, with ISO dates", () => {
    expect(rows.map((r) => r.id)).toEqual(["CARD-1", "CARD-2", "TR-1"]);
    expect(rows[0].date).toBe("2026-10-04");
    expect(rows[0].amount).toBe(20);
  });

  it("classifies kinds and folds tiny card fees", () => {
    expect(rows.map((r) => r.kind)).toEqual(["card", "fee", "investment"]);
  });
});

describe("findReceipt", () => {
  const payment = parseWiseCsv(csv)[0];
  const expense = (over: Partial<Expense>): Expense => ({
    id: "e",
    date: "2026-10-03",
    description: "x",
    amount: 20,
    currency: "USD",
    amountEur: 17,
    category: "software",
    vatDeductible: false,
    fileId: "f",
    ...over,
  });

  it("matches by amount, currency and date window", () => {
    expect(findReceipt(payment, [expense({})])).toBeDefined();
  });

  it("ignores receipts without a file, far dates or other amounts", () => {
    expect(findReceipt(payment, [expense({ fileId: undefined })])).toBeUndefined();
    expect(findReceipt(payment, [expense({ date: "2026-09-01" })])).toBeUndefined();
    expect(findReceipt(payment, [expense({ amount: 21 })])).toBeUndefined();
  });
});
