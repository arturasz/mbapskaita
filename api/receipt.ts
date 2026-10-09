import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthenticated } from "./_lib/auth.js";
import { ensureInboxTables, getSql } from "./_lib/db.js";

type Req = IncomingMessage & {
  body?: { name?: string; contentType?: string; dataBase64?: string };
};

const MODEL = "anthropic/claude-haiku-5.5";
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3_300_000; // Vercel request limit is 4.5 MB including base64 overhead
const CATEGORIES = ["office", "equipment", "software", "travel", "communication", "banking", "professional_services", "other"];

const PROMPT = `You read a purchase receipt or invoice for a small Lithuanian company (MB).
Return ONLY a JSON object with these keys:
- "date": issue/purchase date as YYYY-MM-DD
- "vendor": shop or supplier name
- "description": short description of what was bought (max 80 chars)
- "amount": total paid including VAT, as a number
- "currency": ISO code such as EUR or USD
- "vatAmount": VAT amount as a number, or null if not shown
- "category": one of ${CATEGORIES.join(", ")}
- "hasVatInvoice": true if this is a VAT invoice with the buyer's company details, else false
Use null for anything you cannot read. Do not guess.`;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function extract(contentType: string, name: string, dataBase64: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const dataUrl = `data:${contentType};base64,${dataBase64}`;
  const part =
    contentType === "application/pdf"
      ? { type: "file", file: { filename: name, file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://mb.rezvart.com",
      "X-Title": "MB apskaita",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, part] }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
}

// POST /api/receipt { name, contentType, dataBase64 }
// Stores the original file and returns its id plus fields read by the model (or null).
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (!(await isAuthenticated(req))) return send(res, 401, { error: "Unauthorized" });
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    const { name = "receipt", contentType = "", dataBase64 = "" } = req.body ?? {};
    if (!ALLOWED.includes(contentType)) return send(res, 400, { error: "Unsupported file type" });
    if (dataBase64.length * 0.75 > MAX_BYTES) return send(res, 413, { error: "File too large (max 3 MB)" });

    const sql = getSql();
    await ensureInboxTables(sql);
    const rows = await sql`INSERT INTO files (name, content, content_type)
      VALUES (${name}, decode(${dataBase64}, 'base64'), ${contentType}) RETURNING id`;
    const fileId = rows[0].id as string;

    let extracted: unknown = null;
    let extractError: string | null = null;
    try {
      extracted = await extract(contentType, name, dataBase64);
    } catch (err) {
      extractError = err instanceof Error ? err.message : String(err);
      console.error("receipt extraction failed", extractError);
    }
    return send(res, 200, { fileId, extracted, extractError });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "Server error" });
  }
}
