import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthenticated } from "./_lib/auth.js";
import { getSql } from "./_lib/db.js";

type Req = IncomingMessage & { query: Record<string, string> };

// GET /api/file?id=<uuid> -> the stored PDF (login or agent token required)
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (!(await isAuthenticated(req))) {
      res.statusCode = 401;
      return res.end("Unauthorized");
    }
    const id = req.query.id;
    if (!/^[0-9a-f-]{36}$/.test(id ?? "")) {
      res.statusCode = 400;
      return res.end("Bad id");
    }
    const rows = await getSql()`SELECT name, encode(content, 'base64') AS b64 FROM files WHERE id = ${id}`;
    if (!rows.length) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${rows[0].name}"`);
    res.end(Buffer.from(rows[0].b64 as string, "base64"));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Server error");
  }
}
