import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("../storage", () => ({
  storage: {
    get: async (k: string) => kv.get(k),
    set: async (k: string, v: unknown) => void kv.set(k, v),
  },
}));

import { importWiseFiles } from "./sync-actions";
import { useSyncStore } from "../stores/sync-store";
import { useWiseStore } from "../stores/wise-store";

const HEADER =
  '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"';
const ROW =
  'CARD-1,04-10-2026,"04-10-2026 10:00:00.000",-20.00,USD,"Card",,100,,,,,,,"Link.com",1234,Name,,,0.00,,DEBIT,CARD';
const file = (text: string) => new File([text], "wise.csv", { type: "text/csv" });

describe("importWiseFiles", () => {
  beforeEach(() => {
    kv.clear();
    useWiseStore.setState({ payments: [], decisions: {}, vatKinds: {}, loaded: true });
    useSyncStore.setState({ times: {}, loaded: true });
  });

  it("imports rows and records the sync time", async () => {
    const msg = await importWiseFiles([file(`${HEADER}\n${ROW}`)], new Date("2026-10-12T10:00:00Z"));
    expect(msg).toBe("pridėta 1, atnaujinta 0");
    expect(useWiseStore.getState().payments).toHaveLength(1);
    expect(useSyncStore.getState().times.wise).toBe("2026-10-12T10:00:00.000Z");
  });

  it("reports nothing new on a repeat import", async () => {
    await importWiseFiles([file(`${HEADER}\n${ROW}`)]);
    expect(await importWiseFiles([file(`${HEADER}\n${ROW}`)])).toMatch(/nieko naujo/);
  });
});
