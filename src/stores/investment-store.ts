import { create } from "zustand";
import type { Investment } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "investments";

export interface ImportResult {
  added: number;
  skipped: number;
}

function isDuplicate(existing: Investment[], candidate: Investment): boolean {
  return existing.some(
    (e) =>
      e.asset === candidate.asset &&
      e.purchaseDate === candidate.purchaseDate &&
      e.quantity === candidate.quantity &&
      Math.abs(e.purchasePrice - candidate.purchasePrice) < 0.01 &&
      e.broker === candidate.broker &&
      (e.saleDate ?? "") === (candidate.saleDate ?? ""),
  );
}

interface InvestmentStore {
  investments: Investment[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  add: (investment: Investment) => Promise<void>;
  importBatch: (items: Investment[]) => Promise<ImportResult>;
  update: (id: string, investment: Partial<Investment>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useInvestmentStore = create<InvestmentStore>((set, get) => ({
  investments: [],
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Investment[]>(STORAGE_KEY);
    set({ investments: data ?? [], loaded: true });
  },

  add: async (investment) => {
    const investments = [...get().investments, investment];
    set({ investments });
    await storage.set(STORAGE_KEY, investments);
  },

  importBatch: async (items) => {
    const existing = get().investments;
    const toAdd: Investment[] = [];
    let skipped = 0;

    for (const item of items) {
      if (isDuplicate(existing, item) || isDuplicate(toAdd, item)) {
        skipped++;
      } else {
        toAdd.push(item);
      }
    }

    if (toAdd.length > 0) {
      const investments = [...existing, ...toAdd];
      set({ investments });
      await storage.set(STORAGE_KEY, investments);
    }

    return { added: toAdd.length, skipped };
  },

  update: async (id, partial) => {
    const investments = get().investments.map((inv) =>
      inv.id === id ? { ...inv, ...partial } : inv,
    );
    set({ investments });
    await storage.set(STORAGE_KEY, investments);
  },

  remove: async (id) => {
    const investments = get().investments.filter((inv) => inv.id !== id);
    set({ investments });
    await storage.set(STORAGE_KEY, investments);
  },
}));
