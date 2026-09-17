import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStaleRunning, jobKey, mapPool } from "./queue.ts";

describe("jobKey", () => {
  it("is unique per user and PR", () => {
    assert.equal(
      jobKey({ userId: "u1", owner: "acme", repo: "api", number: 18 }),
      "u1:acme/api#18",
    );
    assert.notEqual(
      jobKey({ userId: "u1", owner: "acme", repo: "api", number: 18 }),
      jobKey({ userId: "u1", owner: "acme", repo: "api", number: 19 }),
    );
  });
});

describe("isStaleRunning", () => {
  it("treats missing timestamps as stale", () => {
    assert.equal(isStaleRunning(null), true);
    assert.equal(isStaleRunning(""), true);
  });
  it("keeps a fresh running review", () => {
    assert.equal(isStaleRunning(new Date().toISOString()), false);
  });
  it("expires a 90s+ running review", () => {
    const old = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    assert.equal(isStaleRunning(old), true);
  });
});

describe("mapPool", () => {
  it("runs every item and preserves order", async () => {
    const seen: number[] = [];
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
    assert.equal(seen.length, 5);
  });
});
