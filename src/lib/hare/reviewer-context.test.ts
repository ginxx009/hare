import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROJECT_BRIEF_PATHS, contextLoadOrder } from "./briefs.ts";

describe("project brief paths", () => {
  it("lists HARE.md and never constitution", () => {
    assert.equal(PROJECT_BRIEF_PATHS[0], "HARE.md");
    assert.ok(!PROJECT_BRIEF_PATHS.some((p) => /constitution/i.test(p)));
  });

  it("loads HARE.md before schema", () => {
    assert.ok(contextLoadOrder("HARE.md") < contextLoadOrder("prisma/schema.prisma"));
  });
});
