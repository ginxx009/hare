import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBotCommentAuthor, mentionsHareBot, shouldHandlePullAction } from "./mention.ts";

describe("mentionsHareBot", () => {
  it("matches a conversation ping", () => {
    assert.equal(
      mentionsHareBot("@hare-bot please re-review — OG asset is now committed"),
      true,
    );
  });
  it("is case-insensitive", () => {
    assert.equal(mentionsHareBot("Hey @Hare-Bot look at this"), true);
  });
  it("ignores other bots and bare words", () => {
    assert.equal(mentionsHareBot("hare-bot without an at-sign"), false);
    assert.equal(mentionsHareBot("@dependabot rebase"), false);
    assert.equal(mentionsHareBot(""), false);
    assert.equal(mentionsHareBot(null), false);
  });
});

describe("isBotCommentAuthor", () => {
  it("skips hare-bot so review comments do not loop", () => {
    assert.equal(isBotCommentAuthor("hare-bot"), true);
    assert.equal(isBotCommentAuthor("Hare-Bot"), true);
    assert.equal(isBotCommentAuthor("ginxx009"), false);
  });
});

describe("shouldHandlePullAction", () => {
  it("reviews opened and synchronize", () => {
    assert.equal(shouldHandlePullAction("opened"), true);
    assert.equal(shouldHandlePullAction("synchronize"), true);
  });
  it("reviews when hare-bot is requested", () => {
    assert.equal(shouldHandlePullAction("review_requested", "hare-bot"), true);
    assert.equal(shouldHandlePullAction("review_requested", "octocat"), false);
  });
  it("ignores labeled", () => {
    assert.equal(shouldHandlePullAction("labeled"), false);
  });
});
