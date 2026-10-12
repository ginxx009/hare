/**
 * Owner sign-in for self-hosted Hare (server-only).
 *
 * One dashboard owner signs in with an access key plus a 6-digit authenticator
 * (TOTP) code. No users table, no sign-up, no third-party login. Active when
 * `HARE_OWNER_ACCESS_KEY_SHA256` is set; the Grok broker sign-in is not used.
 *
 *   HARE_OWNER_ACCESS_KEY_SHA256  hex SHA-256 of the access key (the key itself is never stored)
 *   HARE_OWNER_TOTP_SECRET        base32 TOTP secret (RFC 6238, SHA-1, 6 digits, 30 s)
 *   HARE_SESSION_SECRET           at least 32 characters; signs the session cookie
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_USER_ID = "owner";
export const OWNER_COOKIE = "hare_owner";
const SESSION_SECONDS = 12 * 3600;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const env = (key: string): string | undefined => process.env[key]?.trim() || undefined;

export function ownerAuthEnabled(): boolean {
  return Boolean(env("HARE_OWNER_ACCESS_KEY_SHA256"));
}

function config() {
  const keyHash = env("HARE_OWNER_ACCESS_KEY_SHA256")?.toLowerCase();
  const totpSecret = env("HARE_OWNER_TOTP_SECRET");
  const sessionSecret = env("HARE_SESSION_SECRET");
  if (!keyHash || !/^[0-9a-f]{64}$/.test(keyHash)) {
    throw new Error("HARE_OWNER_ACCESS_KEY_SHA256 must be a 64-character hex SHA-256");
  }
  if (!totpSecret) throw new Error("HARE_OWNER_TOTP_SECRET is required for owner sign-in");
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("HARE_SESSION_SECRET must be at least 32 characters");
  }
  return { keyHash, totp: base32Decode(totpSecret), sessionSecret };
}

export function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("HARE_OWNER_TOTP_SECRET is not valid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Process-local state: one owner, one Hare process. */
const state = globalThis as typeof globalThis & {
  __hareOwnerFailures__?: Map<string, { count: number; since: number; until: number }>;
  __hareOwnerLastStep__?: number;
};
const failures = (state.__hareOwnerFailures__ ??= new Map());

export type OwnerLoginResult = { ok: true } | { ok: false; reason: "invalid" | "locked" };

/**
 * Check the access key and the authenticator code. A code is accepted for the
 * current 30 s step or one step either side, and never twice.
 */
export function verifyOwnerLogin(
  accessKey: string,
  code: string,
  clientId: string,
  now = Date.now(),
): OwnerLoginResult {
  const entry = failures.get(clientId);
  if (entry && entry.until > now) return { ok: false, reason: "locked" };

  const cfg = config();
  const keyOk = safeEqual(createHash("sha256").update(accessKey).digest("hex"), cfg.keyHash);
  const step = Math.floor(now / 30_000);
  let matchedStep: number | undefined;
  if (/^\d{6}$/.test(code)) {
    for (const s of [step - 1, step, step + 1]) {
      if (safeEqual(totpAt(cfg.totp, s), code)) matchedStep = s;
    }
  }
  const replay = matchedStep !== undefined && matchedStep <= (state.__hareOwnerLastStep__ ?? -1);

  if (!keyOk || matchedStep === undefined || replay) {
    const fresh = !entry || now - entry.since > LOCKOUT_MS;
    const count = fresh ? 1 : entry.count + 1;
    failures.set(clientId, {
      count,
      since: fresh ? now : entry.since,
      until: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0,
    });
    return { ok: false, reason: "invalid" };
  }
  failures.delete(clientId);
  state.__hareOwnerLastStep__ = matchedStep;
  return { ok: true };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Set-Cookie value for a fresh owner session. */
export function ownerSessionCookie(secure: boolean, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `${OWNER_USER_ID}.${exp}`;
  const value = `${payload}.${sign(payload, config().sessionSecret)}`;
  return `${OWNER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearedOwnerCookie(secure: boolean): string {
  return `${OWNER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** The owner user id when the request carries a valid, unexpired session cookie. */
export function ownerFromRequest(request: Request, now = Date.now()): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const raw = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OWNER_COOKIE}=`))
    ?.slice(OWNER_COOKIE.length + 1);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [user, expText, mac] = parts;
  if (user !== OWNER_USER_ID) return null;
  if (!safeEqual(mac, sign(`${user}.${expText}`, config().sessionSecret))) return null;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  return OWNER_USER_ID;
}

/** Client id for login throttling: the first forwarded address, else "local". */
export function clientIdOf(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

/** True when the browser reached Hare over HTTPS (directly or through a proxy such as ngrok). */
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https";
}
