import { createHmac, timingSafeEqual } from "node:crypto";
import { findWatchedByRepo, upsertPull } from "./db";
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

export async function handleGithubWebhook(
  payload: string,
  signature: string | null,
  eventName: string | null,
): Promise<{ status: number; body: { ok: boolean; message: string } }> {
  if (eventName === "ping") {
    return { status: 200, body: { ok: true, message: "Hare webhook ready" } };
  }
  if (eventName && eventName !== "pull_request") {
    return { status: 200, body: { ok: true, message: "ignored event" } };
  }

  let data: {
    action?: string;
    repository?: { name?: string; owner?: { login?: string } };
    pull_request?: GhWebhookPull;
  };
  try {
    data = JSON.parse(payload) as typeof data;
  } catch {
    return { status: 400, body: { ok: false, message: "invalid json" } };
  }

  const action = data.action ?? "";
  if (!["opened", "synchronize", "reopened", "ready_for_review"].includes(action)) {
    return { status: 200, body: { ok: true, message: "ignored action" } };
  }

  const owner = data.repository?.owner?.login;
  const repo = data.repository?.name;
  const pr = data.pull_request;
  if (!owner || !repo || !pr) {
    return { status: 400, body: { ok: false, message: "missing pull request" } };
  }

  const watchers = await findWatchedByRepo(owner, repo);
  const matched = watchers.filter((w) =>
    verifyGithubSignature(w.webhookSecret, payload, signature),
  );
  const targets = matched.length > 0 ? matched : [];
  if (targets.length === 0) {
    return { status: 401, body: { ok: false, message: "invalid signature" } };
  }

  let queued = 0;
  for (const watcher of targets) {
    if (!watcher.autoReview) continue;
    await upsertPull(watcher.userId, {
      owner,
      repo,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      author: pr.user?.login ?? "unknown",
      state: pr.state,
      draft: Boolean(pr.draft),
      htmlUrl: pr.html_url,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changed_files ?? 0,
      isDemo: false,
      githubUpdatedAt: pr.updated_at ?? new Date().toISOString(),
    });
    enqueueReview({
      userId: watcher.userId,
      owner,
      repo,
      number: pr.number,
    });
    queued += 1;
  }

  return { status: 200, body: { ok: true, message: `queued ${queued}` } };
}
