import type { StorageAdapter } from "./adapter";
import { IndexedDBStorage } from "./indexeddb";

export type { StorageAdapter };

// Default storage instance — swap this for Electron file-based storage later
export const storage: StorageAdapter = new IndexedDBStorage();
