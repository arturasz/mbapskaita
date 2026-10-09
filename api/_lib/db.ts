import { neon } from "@neondatabase/serverless";

export function getSql() {
  return neon(process.env.DATABASE_URL!);
}

export async function ensureInboxTables(sql: ReturnType<typeof getSql>) {
  await sql`CREATE TABLE IF NOT EXISTS files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    content bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'application/pdf'`;
  await sql`CREATE TABLE IF NOT EXISTS inbox (
    invoice_number text PRIMARY KEY,
    data jsonb NOT NULL,
    file_id uuid REFERENCES files(id),
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
}
