import { createHmac, timingSafeEqual } from "node:crypto";
import { findWatchedByRepo, getConnection, upsertPull } from "./db";
import { getPull } from "./github";
import { isBotCommentAuthor, mentionsHareBot } from "./mention";
import { enqueueReview } from "./queue";

export function verifyGithubSignature(
  secret: string,
  payload: string,
  header: string | null,
): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const given = header.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(given, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}


type GhWebhookPull = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  html_url: string;
  user?: { login?: string } | null;
  head: { sha: string; ref: string };
  base: { sha: string; ref: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  updated_at?: string;
};

const PR_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);
const COMMENT_EVENTS = new Set(["issue_comment", "pull_request_review_comment"]);

async function queueWatchers(input: {
  payload: string;
  signature: string | null;
  owner: string;
  repo: string;
  number: number;
  pull: GhWebhookPull;
  force: boolean;
}): Promise<{ status: number; queued: number; message: string }> {
  const watchers = await findWatchedByRepo(input.owner, input.repo);
  const matched = watchers.filter((w) =>
    verifyGithubSignature(w.webhookSecret, input.payload, input.signature),
  );
  if (matched.length === 0) {
    return { status: 401, queued: 0, message: "invalid signature" };
  }

  let queued = 0;
  for (const watcher of matched) {
    if (!watcher.autoReview) continue;
    await upsertPull(watcher.userId, {
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      title: input.pull.title,
      body: input.pull.body,
      author: input.pull.user?.login ?? "unknown",
      state: input.pull.state,
      draft: Boolean(input.pull.draft),
      htmlUrl: input.pull.html_url,
      headSha: input.pull.head.sha,
      baseSha: input.pull.base.sha,
      headRef: input.pull.head.ref,
      baseRef: input.pull.base.ref,
      additions: input.pull.additions ?? 0,
      deletions: input.pull.deletions ?? 0,
      changedFiles: input.pull.changed_files ?? 0,
      isDemo: false,
      githubUpdatedAt: input.pull.updated_at ?? new Date().toISOString(),
    });
    enqueueReview({
      userId: watcher.userId,
      owner: input.owner,
      repo: input.repo,
      number: input.number,
      force: input.force,
    });
    queued += 1;
  }
  return { status: 200, queued, message: `queued ${queued}` };
}

export async function handleGithubWebhook(
  payload: string,
  signature: string | null,
  eventName: string | null,
): Promise<{ status: number; body: { ok: boolean; message: string } }> {
  if (eventName === "ping") {
    return { status: 200, body: { ok: true, message: "Hare webhook ready" } };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { ok: false, message: "invalid json" } };
  }

  const repository = data.repository as
    | { name?: string; owner?: { login?: string } }
    | undefined;
  const owner = repository?.owner?.login;
  const repo = repository?.name;
  if (!owner || !repo) {
    return { status: 400, body: { ok: false, message: "missing repository" } };
  }

  if (!eventName || eventName === "pull_request") {
    const action = String(data.action ?? "");
    if (!PR_ACTIONS.has(action)) {
      return { status: 200, body: { ok: true, message: "ignored action" } };
    }
    const pr = data.pull_request as GhWebhookPull | undefined;
    if (!pr) {
      return { status: 400, body: { ok: false, message: "missing pull request" } };
    }
    const result = await queueWatchers({
      payload,
      signature,
      owner,
      repo,
      number: pr.number,
      pull: pr,
      force: false,
    });
    return {
      status: result.status,
      body: { ok: result.status === 200, message: result.message },
    };
  }

  if (COMMENT_EVENTS.has(eventName)) {
    const action = String(data.action ?? "");
    if (action !== "created" && action !== "edited") {
      return { status: 200, body: { ok: true, message: "ignored action" } };
    }
    const comment = data.comment as
      | { body?: string; user?: { login?: string } }
      | undefined;
    if (isBotCommentAuthor(comment?.user?.login)) {
      return { status: 200, body: { ok: true, message: "ignored own comment" } };
    }
    if (!mentionsHareBot(comment?.body)) {
      return { status: 200, body: { ok: true, message: "no @hare-bot mention" } };
    }

    let number: number | null = null;
    if (eventName === "issue_comment") {
      const issue = data.issue as
        | { number?: number; pull_request?: unknown }
        | undefined;
      if (!issue?.pull_request) {
        return { status: 200, body: { ok: true, message: "not a pull request comment" } };
      }
      number = typeof issue.number === "number" ? issue.number : null;
    } else {
      const pr = data.pull_request as { number?: number } | undefined;
      number = typeof pr?.number === "number" ? pr.number : null;
    }
    if (!number) {
      return { status: 400, body: { ok: false, message: "missing pull request number" } };
    }

    const watchers = await findWatchedByRepo(owner, repo);
    const matched = watchers.filter((w) =>
      verifyGithubSignature(w.webhookSecret, payload, signature),
    );
    if (matched.length === 0) {
      return { status: 401, body: { ok: false, message: "invalid signature" } };
    }

    const conn = await getConnection(matched[0]!.userId);
    if (!conn) {
      return { status: 200, body: { ok: false, message: "GitHub is not connected" } };
    }

    let live;
    try {
      live = await getPull(conn.token, owner, repo, number);
    } catch (err) {
      return {
        status: 200,
        body: {
          ok: false,
          message: err instanceof Error ? err.message : "could not load pull request",
        },
      };
    }

    const result = await queueWatchers({
      payload,
      signature,
      owner,
      repo,
      number,
      pull: {
        number: live.number,
        title: live.title,
        body: live.body,
        state: live.state,
        draft: live.draft,
        html_url: live.html_url,
        user: live.user,
        head: live.head,
        base: live.base,
        additions: live.additions,
        deletions: live.deletions,
        changed_files: live.changed_files,
        updated_at: live.updated_at,
      },
      force: true,
    });
    return {
      status: result.status,
      body: { ok: result.status === 200, message: result.message },
    };
  }

  return { status: 200, body: { ok: true, message: "ignored event" } };
}
