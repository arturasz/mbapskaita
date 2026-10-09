import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthenticated } from "./_lib/auth.js";

type Req = IncomingMessage & { query: Record<string, string> };

const SEND_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest";
const UA = "mb-apskaita/1.0";

const tag = (xml: string, name: string) =>
  xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET /api/ibkr[?from=yyyymmdd&to=yyyymmdd]
// Runs the saved Flex Query through IBKR's Flex Web Service and returns the CSV.
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (!(await isAuthenticated(req))) {
      res.statusCode = 401;
      return res.end("Unauthorized");
    }
    const token = process.env.IBKR_FLEX_TOKEN;
    const queryId = process.env.IBKR_FLEX_QUERY_ID;
    if (!token || !queryId) throw new Error("IBKR secrets missing");

    const params = new URLSearchParams({ t: token, q: queryId, v: "3" });
    const { from, to } = req.query;
    if (from && to) {
      params.set("fd", from);
      params.set("td", to);
    }
    const sent = await (await fetch(`${SEND_URL}?${params}`, { headers: { "User-Agent": UA } })).text();
    if (tag(sent, "Status") !== "Success") {
      res.statusCode = 502;
      return res.end(`IBKR SendRequest: ${tag(sent, "ErrorCode")} ${tag(sent, "ErrorMessage")}`);
    }
    const reference = tag(sent, "ReferenceCode")!;
    const getUrl = tag(sent, "Url")!;

    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(attempt === 0 ? 3000 : 4000);
      const body = await (
        await fetch(`${getUrl}?${new URLSearchParams({ t: token, q: reference, v: "3" })}`, {
          headers: { "User-Agent": UA },
        })
      ).text();
      if (!body.includes("<FlexStatementResponse")) {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        return res.end(body);
      }
      const code = tag(body, "ErrorCode");
      if (code !== "1019" && tag(body, "Status") !== "Warn") {
        res.statusCode = 502;
        return res.end(`IBKR GetStatement: ${code} ${tag(body, "ErrorMessage")}`);
      }
    }
    res.statusCode = 504;
    res.end("IBKR report not ready, try again");
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Server error");
  }
}
