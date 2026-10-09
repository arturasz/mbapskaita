import type { StorageAdapter } from "./adapter";

export class UnauthorizedError extends Error {}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok && res.status !== 404) throw new Error(`API ${res.status}`);
  return res;
}

const url = (key: string) => `/api/kv?key=${encodeURIComponent(key)}`;

export class RemoteStorage implements StorageAdapter {
  async get<T>(key: string): Promise<T | undefined> {
    const res = await call(url(key));
    if (res.status === 404) return undefined;
    return ((await res.json()) as { value: T }).value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await call(url(key), { method: "PUT", body: JSON.stringify({ value }) });
  }

  async delete(key: string): Promise<void> {
    await call(url(key), { method: "DELETE" });
  }

  async keys(): Promise<string[]> {
    const res = await call("/api/kv");
    return ((await res.json()) as { keys: string[] }).keys;
  }

  async clear(): Promise<void> {
    await call("/api/kv", { method: "DELETE" });
  }
}
