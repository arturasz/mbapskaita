import { create } from "zustand";
import { storage } from "../storage";
import type { SyncSource } from "../lib/sync-status";

const STORAGE_KEY = "sync-times";

// source -> ISO timestamp of the last successful sync
interface SyncStore {
  times: Partial<Record<SyncSource, string>>;
  loaded: boolean;
  hydrate: () => Promise<void>;
  mark: (source: SyncSource, at: string) => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  times: {},
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Partial<Record<SyncSource, string>>>(STORAGE_KEY);
    set({ times: data ?? {}, loaded: true });
  },

  mark: async (source, at) => {
    const times = { ...get().times, [source]: at };
    set({ times });
    await storage.set(STORAGE_KEY, times);
  },
}));
