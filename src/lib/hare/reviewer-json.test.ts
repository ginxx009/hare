import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJson } from "./json.ts";

describe("extractJson", () => {
  it("reads a bare object", () => {
    const out = extractJson('{"summary":"ok","findings":[]}') as { summary: string };
    assert.equal(out.summary, "ok");
  });
  it("reads a fenced object", () => {
    const out = extractJson('Here:\n```json\n{"summary":"fenced"}\n```') as {
      summary: string;
    };
    assert.equal(out.summary, "fenced");
  });
  it("throws a short error on empty", () => {
    assert.throws(() => extractJson(""), /no JSON/);
    assert.throws(() => extractJson("thanks"), /no JSON/);
  });
});
