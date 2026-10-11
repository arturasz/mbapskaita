import { create } from "zustand";
import type { Dividend } from "../types";
import { storage } from "../storage";
import { recalcDividends } from "../lib/recalc-eur";
import type { ToEur } from "../lib/import-ibkr-flex";

const STORAGE_KEY = "dividends";

interface DividendStore {
  dividends: Dividend[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  importBatch: (items: Dividend[]) => Promise<number>;
  recalcEur: (toEur: ToEur) => Promise<void>;
}

export const useDividendStore = create<DividendStore>((set, get) => ({
  dividends: [],
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Dividend[]>(STORAGE_KEY);
    set({ dividends: data ?? [], loaded: true });
  },

  importBatch: async (items) => {
    const known = new Set(get().dividends.map((d) => d.id));
    const fresh = items.filter((d) => !known.has(d.id));
    if (fresh.length > 0) {
      const dividends = [...get().dividends, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
      set({ dividends });
      await storage.set(STORAGE_KEY, dividends);
    }
    return fresh.length;
  },

  recalcEur: async (toEur) => {
    const dividends = await recalcDividends(get().dividends, toEur);
    set({ dividends });
    await storage.set(STORAGE_KEY, dividends);
  },
}));
