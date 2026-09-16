import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROJECT_BRIEF_PATHS,
  contextLoadOrder,
  isProjectBrief,
} from "./briefs.ts";

describe("project brief paths", () => {
  it("prefers SYSTEM_PROFILE.md and never constitution", () => {
    assert.equal(PROJECT_BRIEF_PATHS[0], ".github/claude/SYSTEM_PROFILE.md");
    assert.ok(!PROJECT_BRIEF_PATHS.some((p) => /constitution/i.test(p)));
  });

  it("loads SYSTEM_PROFILE before HARE.md and schema", () => {
    assert.ok(
      contextLoadOrder(".github/claude/SYSTEM_PROFILE.md") <
        contextLoadOrder("HARE.md"),
    );
    assert.ok(
      contextLoadOrder(".github/claude/SYSTEM_PROFILE.md") <
        contextLoadOrder("prisma/schema.prisma"),
    );
  });

  it("treats SYSTEM_PROFILE as a brief", () => {
    assert.equal(isProjectBrief(".github/claude/SYSTEM_PROFILE.md"), true);
    assert.equal(isProjectBrief("src/lib/auth.ts"), false);
  });
});
