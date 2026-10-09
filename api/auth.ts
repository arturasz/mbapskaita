import type { IncomingMessage, ServerResponse } from "node:http";
import {
  clearSessionCookie,
  createSession,
  isAuthenticated,
  verifyGoogleCredential,
} from "./_lib/auth.js";

type Req = IncomingMessage & { body?: { credential?: string } };

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// GET: session check. POST {credential}: Google login. DELETE: logout.
export default async function handler(req: Req, res: ServerResponse) {
  try {
    if (req.method === "GET") {
      return send(res, (await isAuthenticated(req)) ? 200 : 401, {});
    }
    if (req.method === "POST") {
      const credential = req.body?.credential;
      const email = credential ? await verifyGoogleCredential(credential) : null;
      if (!email) return send(res, 403, { error: "Not allowed" });
      res.setHeader("Set-Cookie", await createSession(email));
      return send(res, 200, { email });
    }
    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearSessionCookie);
      return send(res, 200, {});
    }
    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "Server error" });
  }
}
