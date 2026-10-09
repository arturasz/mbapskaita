import type { IncomingMessage } from "node:http";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";

const SESSION_COOKIE = "mb_session";
const SESSION_DAYS = 30;
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const secretKey = () => new TextEncoder().encode(env("SESSION_SECRET"));

/** Verify a Google ID token and return the email if it is the allowed user. */
export async function verifyGoogleCredential(
  credential: string,
): Promise<string | null> {
  const { payload } = await jwtVerify(credential, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env("GOOGLE_CLIENT_ID"),
  });
  const email = String(payload.email ?? "").toLowerCase();
  const allowed = env("ALLOWED_EMAIL").toLowerCase();
  return payload.email_verified && email === allowed ? email : null;
}

export async function createSession(email: string): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearSessionCookie = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** Authenticated if the session cookie is valid or the agent bearer token matches. */
export async function isAuthenticated(req: IncomingMessage): Promise<boolean> {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return bearer === env("AGENT_TOKEN");
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return false;
  try {
    await jwtVerify(cookie, secretKey());
    return true;
  } catch {
    return false;
  }
}
