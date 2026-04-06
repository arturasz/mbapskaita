import { create } from "zustand";
import type { Income } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "incomes";

interface IncomeStore {
  incomes: Income[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  add: (income: Income) => Promise<void>;
  update: (id: string, income: Partial<Income>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useIncomeStore = create<IncomeStore>((set, get) => ({
  incomes: [],
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Income[]>(STORAGE_KEY);
    set({ incomes: data ?? [], loaded: true });
  },

  add: async (income) => {
    const incomes = [...get().incomes, income];
    set({ incomes });
    await storage.set(STORAGE_KEY, incomes);
  },

  update: async (id, partial) => {
    const incomes = get().incomes.map((i) =>
      i.id === id ? { ...i, ...partial } : i,
    );
    set({ incomes });
    await storage.set(STORAGE_KEY, incomes);
  },

  remove: async (id) => {
    const incomes = get().incomes.filter((i) => i.id !== id);
    set({ incomes });
    await storage.set(STORAGE_KEY, incomes);
  },
}));
