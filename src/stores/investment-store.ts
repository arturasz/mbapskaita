import { create } from "zustand";
import type { Investment } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "investments";

interface InvestmentStore {
  investments: Investment[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  add: (investment: Investment) => Promise<void>;
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
