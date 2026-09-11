import { getSql } from "@/lib/db";
import type {
  Finding,
  GithubConnection,
  PullRequest,
  Review,
  ReviewStatus,
  Severity,
  WatchedRepo,
} from "./types";

type PrRow = {
  id: number;
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  author: string;
  state: string;
  draft: boolean;
  html_url: string;
  head_sha: string;
  base_sha: string;
  head_ref: string;
  base_ref: string;
  additions: number;
  deletions: number;
  changed_files: number;
  is_demo: boolean;
  github_updated_at: string | null;
};

type ReviewRow = {
  id: number;
  pr_id: number;
  head_sha: string;
  status: string;
  summary: string | null;
  walkthrough: string | null;
  effort: number | null;
  files_json: string | null;
  posted: boolean;
  post_error: string | null;
  github_review_id: string | null;
  error: string | null;
  incremental: boolean;
  created_at: string;
  completed_at: string | null;
};

type FindingRow = {
  id: number;
  severity: string;
  category: string;
  file_path: string;
  line: number | null;
  start_line: number | null;
  title: string;
  body: string;
  suggestion: string | null;
  posted: boolean;
};

function asBool(value: boolean | number | string | null | undefined): boolean {
  return value === true || value === 1 || value === "t" || value === "true";
}

function mapFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    severity: row.severity as Severity,
    category: row.category,
    filePath: row.file_path,
    line: row.line,
    startLine: row.start_line,
    title: row.title,
    body: row.body,
    suggestion: row.suggestion,
    posted: asBool(row.posted),
  };
}

function mapReview(row: ReviewRow, findings: Finding[]): Review {
  return {
    id: row.id,
    prId: row.pr_id,
    headSha: row.head_sha,
    status: row.status as ReviewStatus,
    summary: row.summary,
    walkthrough: row.walkthrough,
    effort: row.effort,
    filesJson: row.files_json,
    posted: asBool(row.posted),
    postError: row.post_error,
    githubReviewId: row.github_review_id,
    error: row.error,
    incremental: asBool(row.incremental),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    findings,
  };
}

function mapPr(row: PrRow, latestReview: Review | null): PullRequest {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    number: row.number,
    title: row.title,
    body: row.body,
    author: row.author,
    state: row.state,
    draft: asBool(row.draft),
    htmlUrl: row.html_url,
    headSha: row.head_sha,
    baseSha: row.base_sha,
    headRef: row.head_ref,
    baseRef: row.base_ref,
    additions: row.additions,
    deletions: row.deletions,
    changedFiles: row.changed_files,
    isDemo: asBool(row.is_demo),
    githubUpdatedAt: row.github_updated_at,
    latestReview,
  };
}

export async function getConnection(
  userId: string,
): Promise<(GithubConnection & { token: string }) | null> {
  const sql = await getSql();
  const rows = await sql<{
    github_login: string;
    github_user_id: string;
    token: string;
    token_last4: string;
    action_secret: string;
  }>`select github_login, github_user_id, token, token_last4, action_secret
     from github_connections where user_id = ${userId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    githubLogin: row.github_login,
    githubUserId: row.github_user_id,
    tokenLast4: row.token_last4,
    actionSecret: row.action_secret,
    token: row.token,
  };
}

export async function getConnectionPublic(
  userId: string,
): Promise<GithubConnection | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;
  return {
    githubLogin: conn.githubLogin,
    githubUserId: conn.githubUserId,
    tokenLast4: conn.tokenLast4,
    actionSecret: conn.actionSecret,
  };
}

export async function upsertConnection(
  userId: string,
  input: {
    githubLogin: string;
    githubUserId: string;
    token: string;
    tokenLast4: string;
    actionSecret: string;
  },
): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into github_connections
      (user_id, github_login, github_user_id, token, token_last4, action_secret, updated_at)
    values
      (${userId}, ${input.githubLogin}, ${input.githubUserId}, ${input.token}, ${input.tokenLast4}, ${input.actionSecret}, now())
    on conflict (user_id) do update set
      github_login = excluded.github_login,
      github_user_id = excluded.github_user_id,
      token = excluded.token,
      token_last4 = excluded.token_last4,
      updated_at = now()
  `;
}

export async function deleteConnection(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from github_connections where user_id = ${userId}`;
}

export async function findUserByActionSecret(secret: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from github_connections where action_secret = ${secret} limit 1
  `;
  return rows[0]?.user_id ?? null;
}

export async function listWatched(userId: string): Promise<WatchedRepo[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    owner: string;
    repo: string;
    auto_review: boolean;
    auto_post: boolean;
    webhook_secret: string;
    ignore_globs: string;
    created_at: string;
  }>`select id, owner, repo, auto_review, auto_post, webhook_secret, ignore_globs, created_at
     from watched_repos where user_id = ${userId} order by owner, repo`;
  return rows.map((r) => ({
    id: r.id,
    owner: r.owner,
    repo: r.repo,
    autoReview: asBool(r.auto_review),
    autoPost: asBool(r.auto_post),
    webhookSecret: r.webhook_secret,
    ignoreGlobs: r.ignore_globs,
    createdAt: r.created_at,
  }));
}

export async function findWatched(
  userId: string,
  owner: string,
  repo: string,
): Promise<WatchedRepo | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    owner: string;
    repo: string;
    auto_review: boolean;
    auto_post: boolean;
    webhook_secret: string;
    ignore_globs: string;
    created_at: string;
  }>`select id, owner, repo, auto_review, auto_post, webhook_secret, ignore_globs, created_at
     from watched_repos where user_id = ${userId} and owner = ${owner} and repo = ${repo}`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    owner: r.owner,
    repo: r.repo,
    autoReview: asBool(r.auto_review),
    autoPost: asBool(r.auto_post),
    webhookSecret: r.webhook_secret,
    ignoreGlobs: r.ignore_globs,
    createdAt: r.created_at,
  };
}

export async function findWatchedBySecret(secret: string): Promise<
  | (WatchedRepo & { userId: string })
  | null
> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    user_id: string;
    owner: string;
    repo: string;
    auto_review: boolean;
    auto_post: boolean;
    webhook_secret: string;
    ignore_globs: string;
    created_at: string;
  }>`select id, user_id, owner, repo, auto_review, auto_post, webhook_secret, ignore_globs, created_at
     from watched_repos where webhook_secret = ${secret} limit 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    owner: r.owner,
    repo: r.repo,
    autoReview: asBool(r.auto_review),
    autoPost: asBool(r.auto_post),
    webhookSecret: r.webhook_secret,
    ignoreGlobs: r.ignore_globs,
    createdAt: r.created_at,
  };
}

export async function findWatchedByRepo(
  owner: string,
  repo: string,
): Promise<Array<WatchedRepo & { userId: string }>> {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    user_id: string;
    owner: string;
    repo: string;
    auto_review: boolean;
    auto_post: boolean;
    webhook_secret: string;
    ignore_globs: string;
    created_at: string;
  }>`select id, user_id, owner, repo, auto_review, auto_post, webhook_secret, ignore_globs, created_at
     from watched_repos where owner = ${owner} and repo = ${repo}`;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    owner: r.owner,
    repo: r.repo,
    autoReview: asBool(r.auto_review),
    autoPost: asBool(r.auto_post),
    webhookSecret: r.webhook_secret,
    ignoreGlobs: r.ignore_globs,
    createdAt: r.created_at,
  }));
}

export async function upsertWatched(
  userId: string,
  input: {
    owner: string;
    repo: string;
    autoReview: boolean;
    autoPost: boolean;
    webhookSecret: string;
  },
): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into watched_repos (user_id, owner, repo, auto_review, auto_post, webhook_secret)
    values (${userId}, ${input.owner}, ${input.repo}, ${input.autoReview}, ${input.autoPost}, ${input.webhookSecret})
    on conflict (user_id, owner, repo) do update set
      auto_review = excluded.auto_review,
      auto_post = excluded.auto_post
  `;
}

export async function updateWatched(
  userId: string,
  id: number,
  patch: { autoReview?: boolean; autoPost?: boolean; ignoreGlobs?: string },
): Promise<void> {
  const existing = (await listWatched(userId)).find((r) => r.id === id);
  if (!existing) return;
  const sql = await getSql();
  const autoReview = patch.autoReview ?? existing.autoReview;
  const autoPost = patch.autoPost ?? existing.autoPost;
  const ignoreGlobs = patch.ignoreGlobs ?? existing.ignoreGlobs;
  await sql`update watched_repos
    set auto_review = ${autoReview}, auto_post = ${autoPost}, ignore_globs = ${ignoreGlobs}
    where id = ${id} and user_id = ${userId}`;
}

export async function deleteWatched(userId: string, id: number): Promise<void> {
  const sql = await getSql();
  await sql`delete from watched_repos where id = ${id} and user_id = ${userId}`;
}

export async function upsertPull(
  userId: string,
  input: {
    owner: string;
    repo: string;
    number: number;
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
    isDemo: boolean;
    githubUpdatedAt: string | null;
  },
): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ id: number }>`
    insert into pull_requests (
      user_id, owner, repo, number, title, body, author, state, draft, html_url,
      head_sha, base_sha, head_ref, base_ref, additions, deletions, changed_files,
      is_demo, github_updated_at
    ) values (
      ${userId}, ${input.owner}, ${input.repo}, ${input.number}, ${input.title},
      ${input.body}, ${input.author}, ${input.state}, ${input.draft}, ${input.htmlUrl},
      ${input.headSha}, ${input.baseSha}, ${input.headRef}, ${input.baseRef},
      ${input.additions}, ${input.deletions}, ${input.changedFiles}, ${input.isDemo},
      ${input.githubUpdatedAt}
    )
    on conflict (user_id, owner, repo, number) do update set
      title = excluded.title,
      body = excluded.body,
      author = excluded.author,
      state = excluded.state,
      draft = excluded.draft,
      html_url = excluded.html_url,
      head_sha = excluded.head_sha,
      base_sha = excluded.base_sha,
      head_ref = excluded.head_ref,
      base_ref = excluded.base_ref,
      additions = excluded.additions,
      deletions = excluded.deletions,
      changed_files = excluded.changed_files,
      github_updated_at = excluded.github_updated_at
    returning id
  `;
  return rows[0]!.id;
}

export async function getPullRow(
  userId: string,
  owner: string,
  repo: string,
  number: number,
): Promise<PrRow | null> {
  const sql = await getSql();
  const rows = await sql<PrRow>`
    select id, owner, repo, number, title, body, author, state, draft, html_url,
           head_sha, base_sha, head_ref, base_ref, additions, deletions, changed_files,
           is_demo, github_updated_at
    from pull_requests
    where user_id = ${userId} and owner = ${owner} and repo = ${repo} and number = ${number}
  `;
  return rows[0] ?? null;
}

export async function listPulls(userId: string): Promise<PrRow[]> {
  const sql = await getSql();
  return sql<PrRow>`
    select id, owner, repo, number, title, body, author, state, draft, html_url,
           head_sha, base_sha, head_ref, base_ref, additions, deletions, changed_files,
           is_demo, github_updated_at
    from pull_requests
    where user_id = ${userId} and state = 'open'
    order by is_demo desc, github_updated_at desc nulls last, id desc
  `;
}

export async function getReviewBySha(
  prId: number,
  headSha: string,
): Promise<Review | null> {
  const sql = await getSql();
  const rows = await sql<ReviewRow>`
    select id, pr_id, head_sha, status, summary, walkthrough, effort, files_json,
           posted, post_error, github_review_id, error, incremental, created_at, completed_at
    from reviews where pr_id = ${prId} and head_sha = ${headSha}
  `;
  const row = rows[0];
  if (!row) return null;
  const findings = await sql<FindingRow>`
    select id, severity, category, file_path, line, start_line, title, body, suggestion, posted
    from findings where review_id = ${row.id} order by id
  `;
  return mapReview(row, findings.map(mapFinding));
}

export async function getLatestReview(prId: number): Promise<Review | null> {
  const sql = await getSql();
  const rows = await sql<ReviewRow>`
    select id, pr_id, head_sha, status, summary, walkthrough, effort, files_json,
           posted, post_error, github_review_id, error, incremental, created_at, completed_at
    from reviews where pr_id = ${prId} order by id desc limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const findings = await sql<FindingRow>`
    select id, severity, category, file_path, line, start_line, title, body, suggestion, posted
    from findings where review_id = ${row.id} order by id
  `;
  return mapReview(row, findings.map(mapFinding));
}

export async function getPreviousCompleteReview(
  prId: number,
  excludeSha: string,
): Promise<Review | null> {
  const sql = await getSql();
  const rows = await sql<ReviewRow>`
    select id, pr_id, head_sha, status, summary, walkthrough, effort, files_json,
           posted, post_error, github_review_id, error, incremental, created_at, completed_at
    from reviews
    where pr_id = ${prId} and status = 'complete' and head_sha <> ${excludeSha}
    order by id desc limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return mapReview(row, []);
}

export async function insertQueuedReview(
  userId: string,
  prId: number,
  headSha: string,
  incremental: boolean,
): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ id: number }>`
    insert into reviews (user_id, pr_id, head_sha, status, incremental)
    values (${userId}, ${prId}, ${headSha}, 'running', ${incremental})
    on conflict (pr_id, head_sha) do update set
      status = 'running',
      error = null,
      incremental = excluded.incremental
    returning id
  `;
  return rows[0]!.id;
}

export async function completeReview(
  reviewId: number,
  userId: string,
  output: {
    summary: string;
    walkthrough: string;
    effort: number;
    filesJson: string;
    posted: boolean;
    postError: string | null;
    githubReviewId: string | null;
    findings: Array<{
      severity: Severity;
      category: string;
      filePath: string;
      line: number | null;
      startLine: number | null;
      title: string;
      body: string;
      suggestion: string | null;
      posted: boolean;
    }>;
  },
): Promise<void> {
  const sql = await getSql();
  await sql`update reviews set
    status = 'complete',
    summary = ${output.summary},
    walkthrough = ${output.walkthrough},
    effort = ${output.effort},
    files_json = ${output.filesJson},
    posted = ${output.posted},
    post_error = ${output.postError},
    github_review_id = ${output.githubReviewId},
    error = null,
    completed_at = now()
    where id = ${reviewId} and user_id = ${userId}`;
  await sql`delete from findings where review_id = ${reviewId}`;
  for (const f of output.findings) {
    await sql`insert into findings
      (review_id, severity, category, file_path, line, start_line, title, body, suggestion, posted)
      values (${reviewId}, ${f.severity}, ${f.category}, ${f.filePath}, ${f.line},
              ${f.startLine}, ${f.title}, ${f.body}, ${f.suggestion}, ${f.posted})`;
  }
}

export async function failReview(
  reviewId: number,
  userId: string,
  error: string,
): Promise<void> {
  const sql = await getSql();
  await sql`update reviews set status = 'failed', error = ${error}, completed_at = now()
            where id = ${reviewId} and user_id = ${userId}`;
}

export async function hydratePulls(userId: string): Promise<PullRequest[]> {
  const rows = await listPulls(userId);
  const result: PullRequest[] = [];
  for (const row of rows) {
    const latest = await getLatestReview(row.id);
    result.push(mapPr(row, latest));
  }
  return result;
}

export async function hydratePull(
  userId: string,
  owner: string,
  repo: string,
  number: number,
): Promise<PullRequest | null> {
  const row = await getPullRow(userId, owner, repo, number);
  if (!row) return null;
  const latest = await getLatestReview(row.id);
  return mapPr(row, latest);
}

export { mapPr };
