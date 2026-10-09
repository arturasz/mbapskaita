import type { StorageAdapter } from "./adapter";
import { IndexedDBStorage } from "./indexeddb";
import { RemoteStorage } from "./remote";

export type { StorageAdapter };

export const localStorageAdapter = new IndexedDBStorage();

// Data lives in Neon behind /api/kv. IndexedDB is only read once, to migrate old data.
export const storage: StorageAdapter = new RemoteStorage();

/** Copy IndexedDB keys the server does not have yet. Never overwrites server data. */
export async function migrateLocalToRemote(): Promise<number> {
  const remoteKeys = new Set(await storage.keys());
  let copied = 0;
  for (const key of await localStorageAdapter.keys()) {
    if (remoteKeys.has(key)) continue;
    const value = await localStorageAdapter.get(key);
    if (value === undefined) continue;
    await storage.set(key, value);
    copied++;
  }
  return copied;
}
