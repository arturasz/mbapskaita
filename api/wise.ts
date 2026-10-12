import { createSign } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthenticated } from "./_lib/auth.js";

type Req = IncomingMessage & { query: Record<string, string> };

const BASE = "https://api.wise.com";
const MAX_DAYS = 460; // Wise allows at most 469 days per statement call

class WiseError extends Error {}

// Statements need SCA: the first call returns 403 plus a one-time token, which
// we sign with our private key and send back in X-Signature.
async function wiseGet(path: string, token: string, key?: string): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let res = await fetch(`${BASE}${path}`, { headers });
  let step = "unsigned";
  const ott = res.headers.get("x-2fa-approval");
  if (res.status === 403 && ott) {
    if (!key) throw new WiseError("Wise asks for SCA signing, but WISE_PRIVATE_KEY is missing");
    const signature = createSign("RSA-SHA256").update(ott).sign(key, "base64");
    res = await fetch(`${BASE}${path}`, { headers: { ...headers, "x-2fa-approval": ott, "X-Signature": signature } });
    step = `signed, result=${res.headers.get("x-2fa-approval-result") ?? "none"}`;
  }
  if (!res.ok) {
    const sca = ott ? "SCA token received" : "no SCA token in response";
    throw new WiseError(`Wise ${res.status} on ${path.split("?")[0]} (${sca}; ${step}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

// GET /api/wise[?days=90]
// Returns the raw statement of every balance. The browser maps it to payments.
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (!(await isAuthenticated(req))) {
      res.statusCode = 401;
      return res.end("Unauthorized");
    }
    const token = process.env.WISE_API_TOKEN;
    if (!token) throw new WiseError("WISE_API_TOKEN missing");
    const key = process.env.WISE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), MAX_DAYS);

    const profiles = (await wiseGet("/v1/profiles", token)) as { id: number; type: string }[];
    const profileId =
      process.env.WISE_PROFILE_ID ?? (profiles.find((p) => p.type.toLowerCase() === "business") ?? profiles[0])?.id;
    if (!profileId) throw new WiseError("No Wise profile found");

    const balances = (await wiseGet(`/v4/profiles/${profileId}/balances?types=STANDARD`, token)) as {
      id: number;
      currency: string;
    }[];
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const statements = [];
    for (const b of balances) {
      const q = new URLSearchParams({
        currency: b.currency,
        intervalStart: start.toISOString(),
        intervalEnd: end.toISOString(),
        type: "COMPACT",
      });
      const s = await wiseGet(`/v1/profiles/${profileId}/balance-statements/${b.id}/statement.json?${q}`, token, key);
      statements.push({ currency: b.currency, ...(s as object) });
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ statements }));
  } catch (e) {
    res.statusCode = e instanceof WiseError ? 502 : 500;
    res.end((e as Error).message);
  }
}
