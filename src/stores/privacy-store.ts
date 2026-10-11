import { create } from "zustand";
import { setPrivacy } from "../lib/privacy";

const KEY = "mb-privacy";

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

interface PrivacyStore {
  on: boolean;
  set: (on: boolean) => void;
}

export const usePrivacyStore = create<PrivacyStore>((set) => ({
  on: read(),
  set: (on) => {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // storage blocked: the mode still works for this session
    }
    setPrivacy(on);
    set({ on });
  },
}));
