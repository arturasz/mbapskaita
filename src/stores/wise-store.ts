import { create } from "zustand";
import { storage } from "../storage";
import type { WisePayment } from "../lib/import-wise";

const STORAGE_KEY = "wise-payments";

// Payments are re-imported from CSV at any time; only the user's decisions are stored.
export interface WiseDecision {
  status: "ignored";
  note: string;
}

interface WiseStore {
  payments: WisePayment[];
  decisions: Record<string, WiseDecision>;
  loaded: boolean;
  hydrate: () => Promise<void>;
  importPayments: (incoming: WisePayment[]) => Promise<{ added: number }>;
  ignore: (id: string, note: string) => Promise<void>;
  unignore: (id: string) => Promise<void>;
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

  return {
    payments: [],
    decisions: {},
    loaded: false,

    hydrate: async () => {
      const data = await storage.get<Saved>(STORAGE_KEY);
      set({ payments: data?.payments ?? [], decisions: data?.decisions ?? {}, loaded: true });
    },

    importPayments: async (incoming) => {
      const known = new Set(get().payments.map((p) => p.id));
      const fresh = incoming.filter((p) => !known.has(p.id));
      if (fresh.length > 0) {
        set({ payments: [...get().payments, ...fresh].sort((a, b) => b.date.localeCompare(a.date)) });
        await save();
      }
      return { added: fresh.length };
    },

    ignore: async (id, note) => {
      set({ decisions: { ...get().decisions, [id]: { status: "ignored", note } } });
      await save();
    },

    unignore: async (id) => {
      const { [id]: _removed, ...rest } = get().decisions;
      set({ decisions: rest });
      await save();
    },
  };
});
