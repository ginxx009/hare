import {
  completeReview,
  failReview,
  findWatched,
  getConnection,
  getPreviousCompleteReview,
  getPullRow,
  getReviewBySha,
  insertQueuedReview,
  upsertPull,
} from "./db";
import { DEMO_DIFF, DEMO_PR, DEMO_REVIEW } from "./demo";
import { parseUnifiedDiff } from "./diff";
import {
  formatGithubReviewBody,
  formatInlineComment,
  hareGate,
  reviewEvent,
} from "./format";
import {
  createCommitStatus,
  createPullReview,
  getCompareDiff,
  getFileAtRef,
  getPull,
  getPullDiff,
  getPullFiles,
  GithubError,
} from "./github";
import { shouldIgnorePath } from "./ignore";
import {
  buildReviewPrompt,
  filterChangedFiles,
  normalizeReviewerOutput,
  runGrokReview,
  suggestContextPaths,
} from "./reviewer";
import { mergeMigrationFindings, scanMigrationIssues } from "./migrations";
import type { ChangedFile, ReviewerOutput } from "./types";

export function newSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function last4(token: string): string {
  return token.trim().slice(-4);
}

function demoFiles(): ChangedFile[] {
  return parseUnifiedDiff(DEMO_DIFF).map((f) => ({
    path: f.path,
    status: "modified",
    additions: f.addedLines.size,
    deletions: f.lines.filter((l) => l.type === "del").length,
  }));
}

function demoFindingsPosted(posted: boolean) {
  return DEMO_REVIEW.findings.map((f) => {
    const line = f.line ?? 1;
    return { ...f, line, startLine: f.startLine ?? line, posted };
  });
}

async function setHareStatus(
  token: string | null,
  owner: string,
  repo: string,
  sha: string,
  input: {
    state: "pending" | "success" | "failure" | "error";
    description: string;
    targetUrl?: string;
  },
): Promise<string | null> {
  if (!token) return null;
  try {
    await createCommitStatus(token, owner, repo, sha, input);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Could not set Hare status";
  }
}

async function loadDiffBundle(
  token: string,
  owner: string,
  repo: string,
  number: number,
  ignoreGlobs: string,
  previousSha: string | null,
  headSha: string,
): Promise<{ diff: string; files: ChangedFile[]; incremental: boolean }> {
  let files: ChangedFile[] = [];
  try {
    files = filterChangedFiles(
      await getPullFiles(token, owner, repo, number),
      ignoreGlobs,
    ).slice(0, 40);
  } catch (err) {
    if (!(err instanceof GithubError && (err.status === 404 || err.status === 403))) {
      throw err;
    }
  }

  let incremental = false;
  let diff: string;
  try {
    if (previousSha && previousSha !== headSha) {
      try {
        diff = await getCompareDiff(token, owner, repo, previousSha, headSha);
        incremental = true;
      } catch {
        diff = await getPullDiff(token, owner, repo, number);
      }
    } else {
      diff = await getPullDiff(token, owner, repo, number);
    }
  } catch (err) {
    const status = err instanceof GithubError ? err.status : 0;
    if (status === 404 || status === 403) {
      throw new GithubError(
        status || 404,
        "hare-bot cannot read this private PR. Edit the PAT: resource owner Joe-Solutions, repository access All repositories, Contents Read, Pull requests Read and write, then replace the token in Settings.",
      );
    }
    throw err;
  }

  if (!files.length && diff.trim()) {
    files = filterChangedFiles(
      parseUnifiedDiff(diff).map((f) => ({
        path: f.path,
        status: "modified" as const,
        additions: f.addedLines.size,
        deletions: f.lines.filter((l) => l.type === "del").length,
      })),
      ignoreGlobs,
    ).slice(0, 40);
  }

  const kept = new Set(files.map((f) => f.path));
  const rebuilt = files
    .filter((f) => kept.has(f.path) && !shouldIgnorePath(f.path, ignoreGlobs) && f.patch)
    .map(
      (f) =>
        `diff --git a/${f.path} b/${f.path}\n--- a/${f.path}\n+++ b/${f.path}\n${f.patch}`,
    )
    .join("\n");
  if (rebuilt.trim()) diff = rebuilt;

  return { diff, files, incremental };
}

async function postToGithub(input: {
  token: string;
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  output: ReviewerOutput;
}): Promise<{ posted: boolean; githubReviewId: string | null; postError: string | null }> {
  const body = formatGithubReviewBody(input.output, input.output.findings);
  const comments = input.output.findings
    .filter((f) => f.line != null)
    .slice(0, 12)
    .map((f) => ({
      path: f.filePath,
      line: f.line as number,
      body: formatInlineComment(f),
    }));
  const event = reviewEvent(input.output.findings);

  try {
    const created = await createPullReview(
      input.token,
      input.owner,
      input.repo,
      input.number,
      { commitId: input.headSha, body, event, comments },
    );
    return { posted: true, githubReviewId: String(created.id), postError: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    try {
      const created = await createPullReview(
        input.token,
        input.owner,
        input.repo,
        input.number,
        { commitId: input.headSha, body, event: "COMMENT", comments: [] },
      );
      return {
        posted: true,
        githubReviewId: String(created.id),
        postError: `Inline comments skipped: ${detail}`,
      };
    } catch (err2) {
      return {
        posted: false,
        githubReviewId: null,
        postError: err2 instanceof Error ? err2.message : "Failed to post review",
      };
    }
  }
}

export async function ensureDemoPull(userId: string): Promise<number> {
  return upsertPull(userId, {
    owner: DEMO_PR.owner,
    repo: DEMO_PR.repo,
    number: DEMO_PR.number,
    title: DEMO_PR.title,
    body: DEMO_PR.body,
    author: DEMO_PR.author,
    state: DEMO_PR.state,
    draft: DEMO_PR.draft,
    htmlUrl: DEMO_PR.htmlUrl,
    headSha: DEMO_PR.headSha,
    baseSha: DEMO_PR.baseSha,
    headRef: DEMO_PR.headRef,
    baseRef: DEMO_PR.baseRef,
    additions: DEMO_PR.additions,
    deletions: DEMO_PR.deletions,
    changedFiles: DEMO_PR.changedFiles,
    isDemo: true,
    githubUpdatedAt: null,
  });
}

export async function seedDemoReview(userId: string): Promise<void> {
  const prId = await ensureDemoPull(userId);
  const existing = await getReviewBySha(prId, DEMO_PR.headSha);
  if (existing?.status === "complete") return;
  const reviewId = await insertQueuedReview(userId, prId, DEMO_PR.headSha, false);
  await completeReview(reviewId, userId, {
    summary: DEMO_REVIEW.summary,
    walkthrough: DEMO_REVIEW.walkthrough,
    effort: DEMO_REVIEW.effort,
    filesJson: JSON.stringify(DEMO_REVIEW.files),
    posted: true,
    postError: null,
    githubReviewId: "demo",
    findings: demoFindingsPosted(true),
  });
}

export async function reviewPullForUser(input: {
  userId: string;
  owner: string;
  repo: string;
  number: number;
  force?: boolean;
  useLiveModel?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { userId, owner, repo, number } = input;
  const pr = await getPullRow(userId, owner, repo, number);
  if (!pr) return { ok: false, error: "Pull request not found" };

  if (!input.force) {
    const existing = await getReviewBySha(pr.id, pr.head_sha);
    if (existing?.status === "complete" || existing?.status === "running") {
      return { ok: true };
    }
  }

  const reviewId = await insertQueuedReview(userId, pr.id, pr.head_sha, false);

  let token: string | null = null;
  let headSha = pr.head_sha;

  try {
    if (pr.is_demo && !input.useLiveModel) {
      await completeReview(reviewId, userId, {
        summary: DEMO_REVIEW.summary,
        walkthrough: DEMO_REVIEW.walkthrough,
        effort: DEMO_REVIEW.effort,
        filesJson: JSON.stringify(DEMO_REVIEW.files),
        posted: true,
        postError: null,
        githubReviewId: "demo",
        findings: demoFindingsPosted(true),
      });
      return { ok: true };
    }

    let diff = DEMO_DIFF;
    let files: ChangedFile[] = demoFiles();
    let incremental = false;
    let autoPost = false;
    let title = pr.title;
    let body = pr.body;
    let author = pr.author;
    let headRef = pr.head_ref;
    let baseRef = pr.base_ref;
    let htmlUrl = pr.html_url;

    if (!pr.is_demo) {
      const conn = await getConnection(userId);
      if (!conn) {
        await failReview(reviewId, userId, "GitHub is not connected");
        return { ok: false, error: "GitHub is not connected" };
      }
      token = conn.token;
      const watched = await findWatched(userId, owner, repo);
      const ignoreGlobs = watched?.ignoreGlobs ?? "";
      autoPost = watched?.autoPost ?? true;
      const previousForDiff = await getPreviousCompleteReview(pr.id, pr.head_sha);
      const bundle = await loadDiffBundle(
        conn.token,
        owner,
        repo,
        number,
        ignoreGlobs,
        previousForDiff?.headSha ?? null,
        pr.head_sha,
      );
      diff = bundle.diff;
      files = bundle.files;
      incremental = bundle.incremental;

      const live = await getPull(conn.token, owner, repo, number);
      headSha = live.head.sha;
      title = live.title;
      body = live.body;
      author = live.user?.login ?? "unknown";
      headRef = live.head.ref;
      baseRef = live.base.ref;
      htmlUrl = live.html_url;
      await upsertPull(userId, {
        owner,
        repo,
        number,
        title,
        body,
        author,
        state: live.state,
        draft: Boolean(live.draft),
        htmlUrl,
        headSha,
        baseSha: live.base.sha,
        headRef,
        baseRef,
        additions: live.additions ?? pr.additions,
        deletions: live.deletions ?? pr.deletions,
        changedFiles: live.changed_files ?? pr.changed_files,
        isDemo: false,
        githubUpdatedAt: live.updated_at,
      });
    }

    await setHareStatus(token, owner, repo, headSha, {
      state: "pending",
      description: "Hare is reviewing this pull request",
      targetUrl: htmlUrl,
    });

    const previous = await getPreviousCompleteReview(pr.id, headSha);
    let contextFiles: Array<{ path: string; content: string }> = [];
    if (token) {
      const wanted = suggestContextPaths(files).sort(
        (a, b) => Number(/schema\.prisma$/i.test(b)) - Number(/schema\.prisma$/i.test(a)),
      );
      const loaded: Array<{ path: string; content: string }> = [];
      for (const path of wanted) {
        if (loaded.length >= 8) break;
        const content = await getFileAtRef(token, owner, repo, path, headSha);
        if (content && content.length > 40) {
          loaded.push({ path, content });
        }
      }
      contextFiles = loaded;
    }
    const prompt = buildReviewPrompt({
      owner,
      repo,
      number,
      title,
      body,
      author,
      headRef,
      baseRef,
      diff,
      files,
      previousSummary: previous?.summary,
      incremental,
      contextFiles,
    });

    const raw = await runGrokReview(prompt);
    const output = mergeMigrationFindings(
      normalizeReviewerOutput(raw, files, diff),
      scanMigrationIssues({ files, diff, contextFiles }),
    );

    let posted = false;
    let postError: string | null = null;
    let githubReviewId: string | null = null;
    if (!pr.is_demo && autoPost && token) {
      const post = await postToGithub({
        token,
        owner,
        repo,
        number,
        headSha,
        output,
      });
      posted = post.posted;
      postError = post.postError;
      githubReviewId = post.githubReviewId;
    } else if (pr.is_demo) {
      posted = true;
      githubReviewId = "demo";
    }

    const gate = hareGate(output.findings);
    const statusErr = await setHareStatus(token, owner, repo, headSha, {
      state: gate.state,
      description: gate.description,
      targetUrl: htmlUrl,
    });
    if (statusErr) {
      postError = postError ? `${postError}; status: ${statusErr}` : statusErr;
    }

    await completeReview(reviewId, userId, {
      summary: output.summary,
      walkthrough: output.walkthrough,
      effort: output.effort,
      filesJson: JSON.stringify(output.files),
      posted,
      postError,
      githubReviewId,
      findings: output.findings.map((f) => ({ ...f, posted })),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    await failReview(reviewId, userId, message);
    await setHareStatus(token, owner, repo, headSha, {
      state: "error",
      description: message.slice(0, 140),
      targetUrl: pr.html_url,
    });
    return { ok: false, error: message };
  }
}
