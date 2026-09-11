import { createFileRoute } from "@tanstack/react-router";
import { findWatched } from "@/lib/hare/db";
import { getPull } from "@/lib/hare/github";
import { getConnection } from "@/lib/hare/db";
import { runReviewFromWebhook, userIdForActionSecret } from "@/lib/hare/server";

async function post({ request }: { request: Request }) {
  const secret = request.headers.get("x-hare-secret")?.trim();
  if (!secret) {
    return Response.json({ ok: false, message: "missing X-Hare-Secret" }, { status: 401 });
  }
  const userId = await userIdForActionSecret(secret);
  if (!userId) {
    return Response.json({ ok: false, message: "invalid secret" }, { status: 401 });
  }
  let body: { owner?: string; repo?: string; pull_number?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, message: "invalid json" }, { status: 400 });
  }
  const owner = body.owner?.trim();
  const repo = body.repo?.trim();
  const number = Number(body.pull_number);
  if (!owner || !repo || !Number.isFinite(number)) {
    return Response.json({ ok: false, message: "owner, repo, pull_number required" }, { status: 400 });
  }
  const watched = await findWatched(userId, owner, repo);
  if (!watched) {
    return Response.json({ ok: false, message: "repository is not watched" }, { status: 403 });
  }
  const conn = await getConnection(userId);
  if (!conn) {
    return Response.json({ ok: false, message: "GitHub is not connected" }, { status: 400 });
  }
  const pr = await getPull(conn.token, owner, repo, number);
  const result = await runReviewFromWebhook({
    userId,
    owner,
    repo,
    number,
    pull: {
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
      updatedAt: pr.updated_at,
    },
  });
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export const Route = createFileRoute("/api/github/action")({
  server: {
    handlers: {
      POST: post,
    },
  },
});
