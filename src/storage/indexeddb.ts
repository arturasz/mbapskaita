import { get, set, del, keys, clear } from "idb-keyval";
import type { StorageAdapter } from "./adapter";

const PREFIX = "mb-apskaita:";

export class IndexedDBStorage implements StorageAdapter {
  async get<T>(key: string): Promise<T | undefined> {
    return get<T>(PREFIX + key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await set(PREFIX + key, value);
  }

  async delete(key: string): Promise<void> {
    await del(PREFIX + key);
  }

  async keys(): Promise<string[]> {
    const allKeys = await keys();
    return allKeys
      .filter((k): k is string => typeof k === "string" && k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  }

  async clear(): Promise<void> {
    await clear();
  }
}
