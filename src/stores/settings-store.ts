import { create } from "zustand";
import type { Settings } from "../types";
import { storage } from "../storage";

const STORAGE_KEY = "settings";

const defaultSettings: Settings = {
  defaultCurrency: "EUR",
  vatRegistered: false,
  vatScheme: "standard",
  fiscalYear: new Date().getFullYear(),
  memberName: "",
  mbName: "",
  withdrawalPlan: {
    salaryEnabled: false,
    salaryMonthly: 0,
    civilContractEnabled: true,
    civilContractAnnual: 0,
    dividendsEnabled: true,
  },
};

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  hydrate: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Settings>(STORAGE_KEY);
    // Merge with defaults to handle missing fields from older stored data
    set({ settings: data ? { ...defaultSettings, ...data } : defaultSettings, loaded: true });
  },

  update: async (partial) => {
    const settings = { ...get().settings, ...partial };
    set({ settings });
    await storage.set(STORAGE_KEY, settings);
  },
}));
