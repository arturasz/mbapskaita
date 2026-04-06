import { create } from "zustand";
import type { Expense } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "expenses";

interface ExpenseStore {
  expenses: Expense[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  add: (expense: Expense) => Promise<void>;
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
