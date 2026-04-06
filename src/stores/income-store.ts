import { create } from "zustand";
import type { Income } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "incomes";

export interface ImportResult {
  added: number;
  skipped: number;
}

function isDuplicate(existing: Income[], candidate: Income): boolean {
  return existing.some(
    (e) =>
      e.date === candidate.date &&
      e.amount === candidate.amount &&
      e.currency === candidate.currency &&
      e.client === candidate.client &&
      (e.invoiceNumber != null &&
      candidate.invoiceNumber != null
        ? e.invoiceNumber === candidate.invoiceNumber
        : e.description === candidate.description),
  );
}

interface IncomeStore {
  incomes: Income[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  add: (income: Income) => Promise<void>;
  importBatch: (items: Income[]) => Promise<ImportResult>;
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

  importBatch: async (items) => {
    const existing = get().incomes;
    const toAdd: Income[] = [];
    let skipped = 0;

    for (const item of items) {
      if (isDuplicate(existing, item) || isDuplicate(toAdd, item)) {
        skipped++;
      } else {
        toAdd.push(item);
      }
    }

    if (toAdd.length > 0) {
      const incomes = [...existing, ...toAdd];
      set({ incomes });
      await storage.set(STORAGE_KEY, incomes);
    }

    return { added: toAdd.length, skipped };
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
