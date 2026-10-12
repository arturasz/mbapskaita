import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("../storage", () => ({
  storage: {
    get: async (k: string) => kv.get(k),
    set: async (k: string, v: unknown) => void kv.set(k, v),
  },
}));

import { useSyncStore } from "./sync-store";

describe("sync store", () => {
  beforeEach(() => {
    kv.clear();
    useSyncStore.setState({ times: {}, loaded: false });
  });

  it("saves the time per source", async () => {
    await useSyncStore.getState().mark("wise", "2026-10-12T10:00:00Z");
    await useSyncStore.getState().mark("ibkr", "2026-10-11T10:00:00Z");
    expect(kv.get("sync-times")).toEqual({ wise: "2026-10-12T10:00:00Z", ibkr: "2026-10-11T10:00:00Z" });
  });

  it("loads saved times", async () => {
    kv.set("sync-times", { deel: "2026-10-01T00:00:00Z" });
    await useSyncStore.getState().hydrate();
    expect(useSyncStore.getState().times.deel).toBe("2026-10-01T00:00:00Z");
    expect(useSyncStore.getState().loaded).toBe(true);
  });
});
