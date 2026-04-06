import { create } from "zustand";
import type { Expense } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "expenses";

export interface ImportResult {
  added: number;
  skipped: number;
}

function isDuplicate(existing: Expense[], candidate: Expense): boolean {
  return existing.some(
    (e) =>
      e.date === candidate.date &&
      e.amount === candidate.amount &&
      e.description === candidate.description,
  );
}

interface ExpenseStore {
  expenses: Expense[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  add: (expense: Expense) => Promise<void>;
  importBatch: (items: Expense[]) => Promise<ImportResult>;
  update: (id: string, expense: Partial<Expense>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useExpenseStore = create<ExpenseStore>((set, get) => ({
  expenses: [],
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Expense[]>(STORAGE_KEY);
    set({ expenses: data ?? [], loaded: true });
  },

  add: async (expense) => {
    const expenses = [...get().expenses, expense];
    set({ expenses });
    await storage.set(STORAGE_KEY, expenses);
  },

  importBatch: async (items) => {
    const existing = get().expenses;
    const toAdd: Expense[] = [];
    let skipped = 0;

    for (const item of items) {
      if (isDuplicate(existing, item) || isDuplicate(toAdd, item)) {
        skipped++;
      } else {
        toAdd.push(item);
      }
    }

    if (toAdd.length > 0) {
      const expenses = [...existing, ...toAdd];
      set({ expenses });
      await storage.set(STORAGE_KEY, expenses);
    }

    return { added: toAdd.length, skipped };
  },

  update: async (id, partial) => {
    const expenses = get().expenses.map((e) =>
      e.id === id ? { ...e, ...partial } : e,
    );
    set({ expenses });
    await storage.set(STORAGE_KEY, expenses);
  },

  remove: async (id) => {
    const expenses = get().expenses.filter((e) => e.id !== id);
    set({ expenses });
    await storage.set(STORAGE_KEY, expenses);
  },
}));
