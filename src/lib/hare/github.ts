import type { ChangedFile } from "./types";

const GH = "https://api.github.com";

export class GithubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GithubError";
  }
}

async function gh<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "Hare-Reviewer");
  const res = await fetch(`${GH}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new GithubError(
      res.status,
      `GitHub ${res.status}: ${text.slice(0, 240)}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type GhUser = {
  login: string;
  id: number;
};

export type GhRepo = {
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  open_issues_count: number;
  owner: { login: string };
};

export type GhPull = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  html_url: string;
  user: { login: string } | null;
  head: { sha: string; ref: string };
  base: { sha: string; ref: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  updated_at: string;
};

export type GhFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export async function getAuthenticatedUser(token: string): Promise<GhUser> {
  return gh<GhUser>(token, "/user");
}

export async function listUserRepos(token: string): Promise<GhRepo[]> {
  const byName = new Map<string, GhRepo>();
  const add = (batch: GhRepo[]) => {
    for (const repo of batch) byName.set(repo.full_name, repo);
  };

  for (let page = 1; page <= 6; page += 1) {
    const batch = await gh<GhRepo[]>(
      token,
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
    );
    add(batch);
    if (batch.length < 100) break;
  }

  try {
    const orgs = await gh<{ login: string }[]>(token, "/user/orgs?per_page=50");
    for (const org of orgs) {
      for (let page = 1; page <= 6; page += 1) {
        try {
          const batch = await gh<GhRepo[]>(
            token,
            `/orgs/${org.login}/repos?per_page=100&page=${page}&type=all&sort=updated`,
          );
          add(batch);
          if (batch.length < 100) break;
        } catch {
          break;
        }
      }
    }
  } catch {
    /* fine-grained tokens often cannot list orgs; /user/repos still applies */
  }

  return [...byName.values()].sort((a, b) =>
    a.full_name.localeCompare(b.full_name),
  );
}

export async function listOpenPulls(
  token: string,
  owner: string,
  repo: string,
): Promise<GhPull[]> {
  return gh<GhPull[]>(
    token,
    `/repos/${owner}/${repo}/pulls?state=open&per_page=30&sort=updated&direction=desc`,
  );
}

export async function getPull(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<GhPull> {
  return gh<GhPull>(token, `/repos/${owner}/${repo}/pulls/${number}`);
}

export async function getFileAtRef(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const encoded = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  try {
    const data = await gh<{
      type?: string;
      encoding?: string;
      content?: string;
    }>(
      token,
      `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`,
    );
    if (data.type !== "file" || !data.content) return null;
    const raw = data.content.replace(/\n/g, "");
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export async function getPullFiles(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<ChangedFile[]> {
  const files = await gh<GhFile[]>(
    token,
    `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
  );
  return files.map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
}

export async function getPullDiff(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<string> {
  const res = await fetch(
    `${GH}/repos/${owner}/${repo}/pulls/${number}`,
    {
      headers: {
        Accept: "application/vnd.github.diff",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Hare-Reviewer",
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new GithubError(
      res.status,
      `GitHub ${res.status}: ${text.slice(0, 240)}`,
    );
  }
  return res.text();
}

export async function getCompareDiff(
  token: string,
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<string> {
  const res = await fetch(
    `${GH}/repos/${owner}/${repo}/compare/${base}...${head}`,
    {
      headers: {
        Accept: "application/vnd.github.diff",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Hare-Reviewer",
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new GithubError(
      res.status,
      `GitHub ${res.status}: ${text.slice(0, 240)}`,
    );
  }
  return res.text();
}

export type ReviewCommentInput = {
  path: string;
  body: string;
  line: number;
  side?: "LEFT" | "RIGHT";
};

export async function createPullReview(
  token: string,
  owner: string,
  repo: string,
  number: number,
  input: {
    commitId: string;
    body: string;
    event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
    comments: ReviewCommentInput[];
  },
): Promise<{ id: number }> {
  return gh<{ id: number }>(token, `/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      commit_id: input.commitId,
      body: input.body,
      event: input.event,
      comments: input.comments.map((c) => ({
        path: c.path,
        body: c.body,
        line: c.line,
        side: c.side ?? "RIGHT",
      })),
    }),
  });
}

export async function createCommitStatus(
  token: string,
  owner: string,
  repo: string,
  sha: string,
  input: {
    state: "pending" | "success" | "failure" | "error";
    description: string;
    targetUrl?: string;
  },
): Promise<void> {
  await gh(token, `/repos/${owner}/${repo}/statuses/${sha}`, {
    method: "POST",
    body: JSON.stringify({
      state: input.state,
      context: "Hare",
      description: input.description.slice(0, 140),
      target_url: input.targetUrl,
    }),
  });
}

export async function addIssueComment(
  token: string,
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<void> {
  await gh(token, `/repos/${owner}/${repo}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
