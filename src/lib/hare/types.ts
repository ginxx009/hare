export type Severity = "critical" | "major" | "minor" | "nit";

export type ReviewStatus = "queued" | "running" | "complete" | "failed";

export type Finding = {
  id: number;
  severity: Severity;
  category: string;
  filePath: string;
  line: number | null;
  startLine: number | null;
  title: string;
  body: string;
  suggestion: string | null;
  posted: boolean;
};

export type Review = {
  id: number;
  prId: number;
  headSha: string;
  status: ReviewStatus;
  summary: string | null;
  walkthrough: string | null;
  effort: number | null;
  filesJson: string | null;
  posted: boolean;
  postError: string | null;
  githubReviewId: string | null;
  error: string | null;
  incremental: boolean;
  createdAt: string;
  completedAt: string | null;
  findings: Finding[];
};

export type PullRequest = {
  id: number;
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
  latestReview: Review | null;
};

export type WatchedRepo = {
  id: number;
  owner: string;
  repo: string;
  autoReview: boolean;
  autoPost: boolean;
  webhookSecret: string;
  ignoreGlobs: string;
  createdAt: string;
};

export type GithubConnection = {
  githubLogin: string;
  githubUserId: string;
  tokenLast4: string;
  actionSecret: string;
};

export type GithubRepoOption = {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  openIssues: number;
};

export type ChangedFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export type ReviewerOutput = {
  summary: string;
  walkthrough: string;
  effort: number;
  files: Array<{ path: string; description: string }>;
  findings: Array<{
    severity: Severity;
    category: string;
    filePath: string;
    line: number | null;
    startLine: number | null;
    title: string;
    body: string;
    suggestion: string | null;
  }>;
};
