import type { IncomingMessage, ServerResponse } from "node:http";
import { hasInboxToken, isAuthenticated } from "./_lib/auth.js";
import { ensureInboxTables, getSql } from "./_lib/db.js";

type Req = IncomingMessage & { body?: unknown; query: Record<string, string> };

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

interface InboxBody {
  invoiceNumber?: string;
  pdfBase64?: string;
  [field: string]: unknown;
}

// Invoices collected by the browser add-on wait here until you import them in the app.
//   POST   (inbox token)    -> add or replace one invoice (+ optional PDF)
//   GET    (login/agent)    -> list pending invoices
//   DELETE ?invoice=INV-1   -> remove one after import (keeps the PDF)
export default async function handler(req: Req, res: ServerResponse) {
  try {
    const sql = getSql();
    await ensureInboxTables(sql);

    if (req.method === "POST") {
      if (!hasInboxToken(req)) return send(res, 401, { error: "Unauthorized" });
      const { invoiceNumber, pdfBase64, ...data } = (req.body ?? {}) as InboxBody;
      if (!invoiceNumber) return send(res, 400, { error: "Missing invoiceNumber" });
      let fileId: string | null = null;
      if (pdfBase64) {
        const rows = await sql`INSERT INTO files (name, content)
          VALUES (${invoiceNumber + ".pdf"}, decode(${pdfBase64}, 'base64'))
          RETURNING id`;
        fileId = rows[0].id as string;
      }
      await sql`INSERT INTO inbox (invoice_number, data, file_id)
        VALUES (${invoiceNumber}, ${JSON.stringify(data)}::jsonb, ${fileId})
        ON CONFLICT (invoice_number) DO UPDATE
          SET data = EXCLUDED.data, file_id = COALESCE(EXCLUDED.file_id, inbox.file_id)`;
      return send(res, 200, { ok: true, fileId });
    }

    if (!(await isAuthenticated(req))) return send(res, 401, { error: "Unauthorized" });

    if (req.method === "GET") {
      const rows = await sql`SELECT invoice_number, data, file_id FROM inbox ORDER BY created_at`;
      return send(res, 200, {
        items: rows.map((r) => ({
          invoiceNumber: r.invoice_number,
          fileId: r.file_id,
          ...(r.data as object),
        })),
      });
    }
    if (req.method === "DELETE" && req.query.invoice) {
      await sql`DELETE FROM inbox WHERE invoice_number = ${req.query.invoice}`;
      return send(res, 200, {});
    }
    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "Server error" });
  }
}
