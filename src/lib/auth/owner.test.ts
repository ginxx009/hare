import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";

const ACCESS_KEY = "test-access-key-0123456789";
// "12345678901234567890" in base32: the RFC 6238 SHA-1 test secret.
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

process.env.HARE_OWNER_ACCESS_KEY_SHA256 = createHash("sha256").update(ACCESS_KEY).digest("hex");
process.env.HARE_OWNER_TOTP_SECRET = RFC_SECRET_B32;
process.env.HARE_SESSION_SECRET = "s".repeat(40);

const owner = await import("./owner.server.ts");

const g = globalThis as { __hareOwnerFailures__?: Map<string, unknown>; __hareOwnerLastStep__?: number };
beforeEach(() => {
  g.__hareOwnerFailures__?.clear();
  delete g.__hareOwnerLastStep__;
});

const secret = owner.base32Decode(RFC_SECRET_B32);
const codeAt = (ms: number) => owner.totpAt(secret, Math.floor(ms / 30_000));

describe("owner sign-in", () => {
  it("matches the RFC 6238 SHA-1 test vectors (last 6 digits)", () => {
    assert.equal(owner.totpAt(secret, Math.floor(59 / 30)), "287082");
    assert.equal(owner.totpAt(secret, Math.floor(1111111109 / 30)), "081804");
    assert.equal(owner.totpAt(secret, Math.floor(1234567890 / 30)), "005924");
  });

  it("accepts the right key with the current code, once", () => {
    const now = 1_800_000_000_000;
    assert.deepEqual(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(now), "a", now), { ok: true });
    assert.deepEqual(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(now), "a", now), { ok: false, reason: "invalid" });
  });

  it("accepts a code from one step earlier", () => {
    const now = 1_800_000_000_000;
    assert.deepEqual(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(now - 30_000), "a", now), { ok: true });
  });

  it("rejects a wrong key or an old code", () => {
    const now = 1_800_000_000_000;
    assert.equal(owner.verifyOwnerLogin("wrong", codeAt(now), "a", now).ok, false);
    assert.equal(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(now - 120_000), "a", now).ok, false);
    assert.equal(owner.verifyOwnerLogin(ACCESS_KEY, "12345", "a", now).ok, false);
  });

  it("locks a client out after 5 failures for 15 minutes", () => {
    const now = 1_800_000_000_000;
    for (let i = 0; i < 5; i++) owner.verifyOwnerLogin("wrong", "000000", "x", now + i);
    assert.deepEqual(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(now), "x", now + 10), { ok: false, reason: "locked" });
    assert.deepEqual(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(now), "y", now + 10), { ok: true });
    const later = now + 16 * 60_000;
    assert.deepEqual(owner.verifyOwnerLogin(ACCESS_KEY, codeAt(later), "x", later), { ok: true });
  });

  it("issues a cookie that verifies, expires and rejects tampering", () => {
    const now = 1_800_000_000_000;
    const set = owner.ownerSessionCookie(true, now);
    assert.match(set, /HttpOnly; SameSite=Lax; Max-Age=43200; Secure$/);
    const value = set.split(";")[0];
    const req = (cookie: string) => new Request("https://hare.test/", { headers: { cookie } });
    assert.equal(owner.ownerFromRequest(req(value), now + 1000), "owner");
    assert.equal(owner.ownerFromRequest(req(value), now + 13 * 3600_000), null);
    const [name, v] = value.split("=");
    const parts = v.split(".");
    assert.equal(owner.ownerFromRequest(req(`${name}=${parts[0]}.${Number(parts[1]) + 999}.${parts[2]}`), now), null);
    assert.equal(owner.ownerFromRequest(req("other=1"), now), null);
  });
});
