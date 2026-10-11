import { create } from "zustand";
import { storage } from "../storage";
import type { WisePayment } from "../lib/import-wise";

const STORAGE_KEY = "wise-payments";

// Payments come from the CSV; the user's decisions are kept per payment id.
export type WiseDecision =
  | { status: "ignored"; note: string }
  | { status: "linked"; expenseId: string };

interface WiseStore {
  payments: WisePayment[];
  decisions: Record<string, WiseDecision>;
  loaded: boolean;
  hydrate: () => Promise<void>;
  importPayments: (incoming: WisePayment[]) => Promise<{ added: number; updated: number }>;
  ignore: (id: string, note: string) => Promise<void>;
  link: (id: string, expenseId: string) => Promise<void>;
  clearDecision: (id: string) => Promise<void>;
}

interface Saved {
  payments: WisePayment[];
  decisions: Record<string, WiseDecision>;
}

export const useWiseStore = create<WiseStore>((set, get) => {
  const save = () => {
    const { payments, decisions } = get();
    return storage.set<Saved>(STORAGE_KEY, { payments, decisions });
  };
  const decide = async (id: string, decision: WiseDecision) => {
    set({ decisions: { ...get().decisions, [id]: decision } });
    await save();
  };

  return {
    payments: [],
    decisions: {},
    loaded: false,

    hydrate: async () => {
      const data = await storage.get<Saved>(STORAGE_KEY);
      const decisions = data?.decisions ?? {};
      set({ payments: data?.payments ?? [], decisions, loaded: true });
    },

    // Re-importing refreshes stored rows, so new parser fields reach old imports.
    importPayments: async (incoming) => {
      const byId = new Map(get().payments.map((p) => [p.id, p]));
      let added = 0;
      let updated = 0;
      for (const p of incoming) {
        const old = byId.get(p.id);
        if (!old) added++;
        else if (JSON.stringify(old) !== JSON.stringify(p)) updated++;
        byId.set(p.id, p);
      }
      if (added + updated > 0) {
        set({ payments: [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)) });
        await save();
      }
      return { added, updated };
    },

    ignore: (id, note) => decide(id, { status: "ignored", note }),
    link: (id, expenseId) => decide(id, { status: "linked", expenseId }),

    clearDecision: async (id) => {
      const { [id]: _removed, ...rest } = get().decisions;
      set({ decisions: rest });
      await save();
    },
  };
});
