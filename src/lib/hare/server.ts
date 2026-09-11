import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  deleteConnection,
  deleteWatched,
  findUserByActionSecret,
  findWatched,
  getConnection,
  getConnectionPublic,
  hydratePull,
  hydratePulls,
  listWatched,
  updateWatched,
  upsertConnection,
  upsertPull,
  upsertWatched,
} from "./db";
import { DEMO_DIFF } from "./demo";
import {
  ensureDemoPull,
  last4,
  newSecret,
  reviewPullForUser,
  seedDemoReview,
} from "./engine";
import {
  getAuthenticatedUser,
  getPullDiff,
  GithubError,
  listOpenPulls,
  listUserRepos,
} from "./github";

const MAX_AUTO_REVIEWS = 3;

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await seedDemoReview(context.userId);
    const [connection, watched, pulls] = await Promise.all([
      getConnectionPublic(context.userId),
      listWatched(context.userId),
      hydratePulls(context.userId),
    ]);
    return { connection, watched, pulls };
  });

export const getPullDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { owner: string; repo: string; number: number }) => input)
  .handler(async ({ context, data }) => {
    await seedDemoReview(context.userId);
    const pull = await hydratePull(
      context.userId,
      data.owner,
      data.repo,
      data.number,
    );
    let diff: string | null = pull?.isDemo ? DEMO_DIFF : null;
    if (pull && !pull.isDemo) {
      const conn = await getConnection(context.userId);
      if (conn) {
        try {
          diff = await getPullDiff(conn.token, pull.owner, pull.repo, pull.number);
        } catch {
          diff = null;
        }
      }
    }
    const watched = pull
      ? await findWatched(context.userId, pull.owner, pull.repo)
      : null;
    return { pull, diff, watched };
  });

export const connectGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token: string }) => ({
    token: input.token.trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.token) return { ok: false as const, error: "Paste a GitHub token." };
    try {
      const user = await getAuthenticatedUser(data.token);
      const existing = await getConnection(context.userId);
      await upsertConnection(context.userId, {
        githubLogin: user.login,
        githubUserId: String(user.id),
        token: data.token,
        tokenLast4: last4(data.token),
        actionSecret: existing?.actionSecret ?? newSecret(),
      });
      return { ok: true as const, login: user.login };
    } catch (err) {
      const message =
        err instanceof GithubError
          ? "GitHub rejected that token. Use a classic or fine-grained PAT with repo and pull-request access."
          : "Could not reach GitHub.";
      return { ok: false as const, error: message };
    }
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await deleteConnection(context.userId);
    return { ok: true as const };
  });

export const listAvailableRepos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const conn = await getConnection(context.userId);
    if (!conn) return { ok: false as const, error: "Connect GitHub first.", repos: [] };
    try {
      const repos = await listUserRepos(conn.token);
      return {
        ok: true as const,
        repos: repos.map((r) => ({
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
          private: r.private,
          description: r.description,
          openIssues: r.open_issues_count,
        })),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Failed to list repos",
        repos: [],
      };
    }
  });

export const watchRepo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { owner: string; repo: string }) => input)
  .handler(async ({ context, data }) => {
    await upsertWatched(context.userId, {
      owner: data.owner,
      repo: data.repo,
      autoReview: true,
      autoPost: true,
      webhookSecret: newSecret(),
    });
    return { ok: true as const };
  });

export const unwatchRepo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ context, data }) => {
    await deleteWatched(context.userId, data.id);
    return { ok: true as const };
  });

export const patchWatched = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      id: number;
      autoReview?: boolean;
      autoPost?: boolean;
      ignoreGlobs?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await updateWatched(context.userId, data.id, data);
    return { ok: true as const };
  });

export const syncInbox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await seedDemoReview(context.userId);
    const conn = await getConnection(context.userId);
    if (!conn) {
      return { ok: true as const, reviewed: 0, pulled: 0 };
    }
    const watched = await listWatched(context.userId);
    let pulled = 0;
    const pending: Array<{ owner: string; repo: string; number: number }> = [];
    const errors: string[] = [];

    for (const repo of watched) {
      try {
        const pulls = await listOpenPulls(conn.token, repo.owner, repo.repo);
        for (const p of pulls) {
          await upsertPull(context.userId, {
            owner: repo.owner,
            repo: repo.repo,
            number: p.number,
            title: p.title,
            body: p.body,
            author: p.user?.login ?? "unknown",
            state: p.state,
            draft: Boolean(p.draft),
            htmlUrl: p.html_url,
            headSha: p.head.sha,
            baseSha: p.base.sha,
            headRef: p.head.ref,
            baseRef: p.base.ref,
            additions: p.additions ?? 0,
            deletions: p.deletions ?? 0,
            changedFiles: p.changed_files ?? 0,
            isDemo: false,
            githubUpdatedAt: p.updated_at,
          });
          pulled += 1;
          if (repo.autoReview) {
            pending.push({
              owner: repo.owner,
              repo: repo.repo,
              number: p.number,
            });
          }
        }
      } catch (err) {
        const detail =
          err instanceof GithubError
            ? err.message
            : "hare-bot cannot read this repository";
        errors.push(`${repo.owner}/${repo.repo}: ${detail}`);
      }
    }

    let reviewed = 0;
    for (const item of pending) {
      if (reviewed >= MAX_AUTO_REVIEWS) break;
      const result = await reviewPullForUser({
        userId: context.userId,
        ...item,
      });
      if (result.ok) reviewed += 1;
    }

    return { ok: true as const, reviewed, pulled, errors };
  });

export const runReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      owner: string;
      repo: string;
      number: number;
      force?: boolean;
      useLiveModel?: boolean;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await ensureDemoPull(context.userId);
    return reviewPullForUser({
      userId: context.userId,
      owner: data.owner,
      repo: data.repo,
      number: data.number,
      force: data.force,
      useLiveModel: data.useLiveModel,
    });
  });

export async function runReviewFromWebhook(input: {
  userId: string;
  owner: string;
  repo: string;
  number: number;
  pull: {
    title: string;
    body: string | null;
    author: string;
    state: string;
    draft: boolean;
    htmlUrl: string;
    headSha: string;
    baseSha: string;
    headRef: string;
    baseRef: string;
    additions: number;
    deletions: number;
    changedFiles: number;
    updatedAt: string;
  };
}): Promise<{ ok: boolean; error?: string }> {
  await upsertPull(input.userId, {
    owner: input.owner,
    repo: input.repo,
    number: input.number,
    title: input.pull.title,
    body: input.pull.body,
    author: input.pull.author,
    state: input.pull.state,
    draft: input.pull.draft,
    htmlUrl: input.pull.htmlUrl,
    headSha: input.pull.headSha,
    baseSha: input.pull.baseSha,
    headRef: input.pull.headRef,
    baseRef: input.pull.baseRef,
    additions: input.pull.additions,
    deletions: input.pull.deletions,
    changedFiles: input.pull.changedFiles,
    isDemo: false,
    githubUpdatedAt: input.pull.updatedAt,
  });
  return reviewPullForUser({
    userId: input.userId,
    owner: input.owner,
    repo: input.repo,
    number: input.number,
  });
}

export async function userIdForActionSecret(
  secret: string,
): Promise<string | null> {
  return findUserByActionSecret(secret);
}
