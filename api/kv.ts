import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";
import { isAuthenticated } from "./_lib/auth";

type Req = IncomingMessage & { body?: unknown; query: Record<string, string> };

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// Key-value store backed by Neon. One row per key, value is JSON.
//   GET    /api/kv            -> list keys
//   GET    /api/kv?key=k      -> { value } (404 if missing)
//   PUT    /api/kv?key=k      -> body { value }
//   DELETE /api/kv?key=k      -> delete (no key: clear all)
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (!(await isAuthenticated(req))) return send(res, 401, { error: "Unauthorized" });
    const sql = neon(process.env.DATABASE_URL!);
    await sql`CREATE TABLE IF NOT EXISTS kv (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    const key = req.query.key;

    if (req.method === "GET" && !key) {
      const rows = await sql`SELECT key FROM kv ORDER BY key`;
      return send(res, 200, { keys: rows.map((r) => r.key) });
    }
    if (req.method === "GET") {
      const rows = await sql`SELECT value FROM kv WHERE key = ${key}`;
      return rows.length
        ? send(res, 200, { value: rows[0].value })
        : send(res, 404, { error: "Not found" });
    }
    if (req.method === "PUT" && key) {
      const { value } = (req.body ?? {}) as { value?: unknown };
      if (value === undefined) return send(res, 400, { error: "Missing value" });
      await sql`INSERT INTO kv (key, value) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
      return send(res, 200, {});
    }
    if (req.method === "DELETE") {
      if (key) await sql`DELETE FROM kv WHERE key = ${key}`;
      else await sql`DELETE FROM kv`;
      return send(res, 200, {});
    }
    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "Server error" });
  }
}
