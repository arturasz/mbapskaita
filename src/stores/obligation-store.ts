import { create } from "zustand";
import { storage } from "../storage";

const STORAGE_KEY = "obligations-done";

// key -> ISO date the user marked it done
interface ObligationStore {
  done: Record<string, string>;
  loaded: boolean;
  hydrate: () => Promise<void>;
  toggle: (key: string, today: string) => Promise<void>;
}

export const useObligationStore = create<ObligationStore>((set, get) => ({
  done: {},
  loaded: false,

  hydrate: async () => {
    const data = await storage.get<Record<string, string>>(STORAGE_KEY);
    set({ done: data ?? {}, loaded: true });
  },

  toggle: async (key, today) => {
    const { [key]: was, ...rest } = get().done;
    const done = was ? rest : { ...rest, [key]: today };
    set({ done });
    await storage.set(STORAGE_KEY, done);
  },
}));
