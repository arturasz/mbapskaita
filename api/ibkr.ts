import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthenticated } from "./_lib/auth.js";
import { getSql } from "./_lib/db.js";

type Req = IncomingMessage & { query: Record<string, string> };

const SEND_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest";
const UA = "mb-apskaita/1.0";
const CACHE_KEY = "ibkr-flex-cache";
const CACHE_MINUTES = 10;
const RETRY_CODES = new Set(["1001", "1004", "1005", "1006", "1007", "1008", "1009", "1018", "1019", "1021"]);

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();
const isBusy = (code: string, message = "") => RETRY_CODES.has(code) || /try again|in progress|too many/i.test(message);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// IBKR appends a large exchange-rate table (we use ECB rates). Drop it.
const withoutRateTable = (csv: string) => {
  const at = csv.indexOf('"Date/Time","FromCurrency"');
  return at === -1 ? csv : csv.slice(0, at);
};

class IbkrError extends Error {}

async function fetchReport(token: string, queryId: string, range?: { from: string; to: string }) {
  const params = new URLSearchParams({ t: token, q: queryId, v: "3" });
  if (range) {
    params.set("fd", range.from);
    params.set("td", range.to);
  }
  const deadline = Date.now() + 50_000;
  let lastError = "";

  // Step 1: ask IBKR to generate the statement (retry while it is busy).
  let reference = "";
  let getUrl = "";
  for (let wait = 2000; Date.now() < deadline; wait = Math.min(wait * 2, 10_000)) {
    const sent = await (await fetch(`${SEND_URL}?${params}`, { headers: { "User-Agent": UA } })).text();
    if (tag(sent, "Status") === "Success") {
      reference = tag(sent, "ReferenceCode")!;
      getUrl = tag(sent, "Url")!;
      break;
    }
    const code = tag(sent, "ErrorCode") ?? "";
    lastError = `${code} ${tag(sent, "ErrorMessage")}`;
    if (!isBusy(code, tag(sent, "ErrorMessage"))) throw new IbkrError(`SendRequest: [${code}] ${lastError}`);
    await sleep(wait);
  }
  if (!reference) throw new IbkrError(`SendRequest: ${lastError} (still busy, try again in a minute)`);

  // Step 2: download it once it is ready.
  while (Date.now() < deadline) {
    await sleep(3000);
    const body = await (
      await fetch(`${getUrl}?${new URLSearchParams({ t: token, q: reference, v: "3" })}`, {
        headers: { "User-Agent": UA },
      })
    ).text();
    if (!body.includes("<FlexStatementResponse")) return body;
    const code = tag(body, "ErrorCode") ?? "";
    lastError = `${code} ${tag(body, "ErrorMessage")}`;
    if (!isBusy(code, tag(body, "ErrorMessage"))) throw new IbkrError(`GetStatement: [${code}] ${lastError}`);
  }
  throw new IbkrError(`GetStatement: ${lastError} (not ready, try again in a minute)`);
}

// GET /api/ibkr[?from=yyyymmdd&to=yyyymmdd][&fresh=1]
// Runs the saved Flex Query through IBKR's Flex Web Service and returns the CSV.
// The default report is cached for a few minutes so repeated clicks do not hammer IBKR.
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (!(await isAuthenticated(req))) {
      res.statusCode = 401;
      return res.end("Unauthorized");
    }
    const token = process.env.IBKR_FLEX_TOKEN;
    const queryId = process.env.IBKR_FLEX_QUERY_ID;
    if (!token || !queryId) throw new Error("IBKR secrets missing");

    const { from, to, fresh } = req.query;
    const range = from && to ? { from, to } : undefined;
    const sql = getSql();
    await sql`CREATE TABLE IF NOT EXISTS kv (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    if (!range && !fresh) {
      const rows = await sql`SELECT value FROM kv WHERE key = ${CACHE_KEY}
        AND updated_at > now() - (${CACHE_MINUTES} || ' minutes')::interval`;
      if (rows.length) {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("X-Cache", "hit");
        return res.end((rows[0].value as { csv: string }).csv);
      }
    }

    const csv = withoutRateTable(await fetchReport(token, queryId, range));
    if (!range) {
      await sql`INSERT INTO kv (key, value) VALUES (${CACHE_KEY}, ${JSON.stringify({ csv })}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.end(csv);
  } catch (err) {
    console.error(err);
    res.statusCode = err instanceof IbkrError ? 502 : 500;
    res.end(err instanceof IbkrError ? `IBKR ${err.message}` : "Server error");
  }
}
