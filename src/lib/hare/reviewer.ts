import { parseUnifiedDiff, snapToChangedLine, truncateDiff } from "./diff";
import { shouldIgnorePath } from "./ignore";
import type { ChangedFile, ReviewerOutput, Severity } from "./types";
import { PROJECT_BRIEF_PATHS } from "./briefs";

const SEVERITIES: Severity[] = ["critical", "major", "minor", "nit"];

const SYSTEM = `You are Hare, a senior staff engineer reviewing a GitHub pull request.
Accuracy over volume. A wrong Major is worse than a missed Nit.
Return ONLY valid JSON matching this schema:
{
  "summary": string,
  "walkthrough": string (markdown, short sections, no emoji),
  "effort": number (1-5),
  "files": [{"path": string, "description": string}],
  "findings": [{
    "severity": "critical"|"major"|"minor"|"nit",
    "category": "security"|"bug"|"performance"|"style"|"config"|"privacy"|"test",
    "filePath": string,
    "line": number|null,
    "startLine": number|null,
    "title": string,
    "body": string,
    "suggestion": string|null
  }]
}

Severity (strict):
- Critical: a demonstrated exploit, secret leak, auth bypass, or data-loss path that exists in THIS diff. You must name the line that makes it exploitable today.
- Major: a definite bug or broken contract you can prove from the diff + repo context. Not "might" or "if another model exists".
- Minor: real gaps (validation, error UI, tests, inconsistent paid-gating) that match what the rest of the repo already does, or that are product risks without a proven exploit.
- Nit: naming, enums, comments. Sparingly.

Accuracy rules:
- If .github/claude/SYSTEM_PROFILE.md is in repo context, treat it as the project brief for this repo. It beats generic habits. If it is missing, review the diff with the normal rules — do not fail the review.
- Do not invent rules from CLAUDE workspace profiles or constitution.mdc (those are not in this git repo).
- Review the diff first. Use repo context files only to verify conventions, not to invent extra scope.
- Cite real paths and NEW-file (right-hand) line numbers from the diff. If you cannot point at a changed line, omit the finding.
- Do not file Critical/Major on a pattern that sibling/context files already use (example: session.user.id is the tenant id everywhere). At most a Nit asking for a comment.
- Hypotheticals are forbidden at Critical/Major: never "if sessions can represent members", "only if", "confirm that", "this becomes", "possible". Either prove it from context or drop/downgrade.
- Missing paid-plan / role checks: Major only if context shows sibling endpoints already enforce that check. Otherwise Minor.
- Privacy/plaintext: Minor unless this PR stores secrets (tokens, passwords, MFA) in clear text. PII next to existing plaintext chats is not Critical.
- Migrations / schema: always compare new SQL to prisma/schema.prisma (or drizzle schema) in context. Major — not Nit — when:
  - A FK column type does not match the referenced column (TEXT/VARCHAR vs UUID is the classic Postgres 42804 failure at migrate deploy).
  - Prisma String + @db.Uuid is UUID in Postgres; plain String is TEXT. Align both sides.
  - ALTER COLUMN SET NOT NULL with no backfill/default.
  - DROP TABLE (Critical) or DROP COLUMN on a live table (Major).
  Hare also runs a deterministic SQL/Prisma checker; still file these if you see them so the walkthrough mentions the migration.
- Every finding in the summary must exist in the findings array. Do not mention extra issues in prose that you did not file.
- Prefer fewer, sharper findings. Cap at 8. Empty findings is valid.
- suggestion is a drop-in snippet for the flagged lines, or null.
- walkthrough: what the PR does, by layer (data, logic, API, tests). No emoji, no praise.
- Skip generated/lock files and formatting-only noise.`;

function asSeverity(value: unknown): Severity {
  const s = String(value ?? "").toLowerCase();
  return (SEVERITIES as string[]).includes(s) ? (s as Severity) : "minor";
}

const HYPOTHETICAL =
  /\b(if sessions can|only if|unless the|assuming |this becomes|possible if|might be|may be|could be|confirm (the|that|whether)|if another)\b/i;

export function groundSeverity(severity: Severity, title: string, body: string): Severity {
  if (severity !== "critical" && severity !== "major") return severity;
  const text = `${title}\n${body}`;
  if (HYPOTHETICAL.test(text)) return "minor";
  return severity;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Reviewer returned no JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export function filterChangedFiles(
  files: ChangedFile[],
  ignoreGlobs: string,
): ChangedFile[] {
  return files.filter((f) => !shouldIgnorePath(f.path, ignoreGlobs));
}

function resolveRelative(fromFile: string, spec: string): string | null {
  const parts = fromFile.split("/");
  parts.pop();
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/") || null;
}

/** Auth/session helpers and local imports the model must read before filing Majors. */
export function suggestContextPaths(files: ChangedFile[]): string[] {
  const out = new Set<string>(PROJECT_BRIEF_PATHS);
  const needsAuthContext = files.some(
    (f) =>
      /(?:^|\/)(route|api)\.[jt]sx?$/.test(f.path) ||
      f.path.includes("/api/") ||
      /session|auth|tenant|lead/i.test(f.path),
  );
  if (needsAuthContext) {
    for (const p of [
      "src/lib/auth.ts",
      "src/lib/auth/index.ts",
      "src/lib/dev-auth.ts",
      "src/lib/session.ts",
      "lib/auth.ts",
    ]) {
      out.add(p);
    }
  }

  const needsSchema = files.some(
    (f) =>
      f.path.includes("prisma/") ||
      f.path.endsWith("schema.prisma") ||
      /migration\.sql$/i.test(f.path),
  );
  if (needsSchema) {
    out.add("prisma/schema.prisma");
    out.add("schema.prisma");
    out.add("drizzle/schema.ts");
    out.add("src/db/schema.ts");
    out.add("src/schema.ts");
  }

  const importRe = /from\s+["']([^"']+)["']/g;
  for (const file of files) {
    const patch = file.patch ?? "";
    for (const match of patch.matchAll(importRe)) {
      const spec = match[1];
      if (spec.startsWith("@/")) {
        const rest = spec.slice(2);
        out.add(`src/${rest}.ts`);
        out.add(`src/${rest}.tsx`);
        out.add(`src/${rest}/index.ts`);
      } else if (spec.startsWith("./") || spec.startsWith("../")) {
        const resolved = resolveRelative(file.path, spec);
        if (resolved) {
          out.add(`${resolved}.ts`);
          out.add(`${resolved}.tsx`);
          out.add(`${resolved}/index.ts`);
        }
      }
    }
  }

  return [...out].filter((p) => !files.some((f) => f.path === p)).slice(0, 16);
}

export function buildReviewPrompt(input: {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  author: string;
  headRef: string;
  baseRef: string;
  diff: string;
  files: ChangedFile[];
  previousSummary?: string | null;
  incremental: boolean;
  contextFiles?: Array<{ path: string; content: string }>;
}): string {
  const fileList = input.files
    .slice(0, 40)
    .map(
      (f) =>
        `- ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`,
    )
    .join("\n");

  const previous = input.incremental
    ? `\nThis is an incremental review. Prior summary:\n${input.previousSummary ?? "(none)"}\nFocus on NEW changes in this diff.\n`
    : "";

  const context = (input.contextFiles ?? [])
    .slice(0, 8)
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``)
    .join("\n\n");

  const contextBlock = context
    ? `\nRepo context. .github/claude/SYSTEM_PROFILE.md (if present) is the project brief. Other files are conventions only — not part of this diff. If no brief is present, review the diff with default rules:\n${context}\n`
    : "";

  return `Repository: ${input.owner}/${input.repo}
PR #${input.number}: ${input.title}
Author: ${input.author}
${input.baseRef} ← ${input.headRef}
${input.body ? `Description:\n${input.body.slice(0, 2500)}\n` : ""}
Changed files:
${fileList || "(none after ignore filters)"}
${previous}${contextBlock}
Unified diff:
\`\`\`diff
${truncateDiff(input.diff)}
\`\`\`
`;
}

export function normalizeReviewerOutput(
  raw: unknown,
  files: ChangedFile[],
  diff: string,
): ReviewerOutput {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const parsedFiles = parseUnifiedDiff(diff);
  const byPath = new Map(parsedFiles.map((f) => [f.path, f]));

  const changedPaths = new Set(files.map((f) => f.path));
  const findingsIn = Array.isArray(obj.findings) ? obj.findings : [];
  const findings = findingsIn
    .slice(0, 8)
    .map((item) => {
      const f = (item ?? {}) as Record<string, unknown>;
      const filePath = String(f.filePath ?? f.path ?? "unknown");
      const lineRaw =
        typeof f.line === "number"
          ? f.line
          : Number.parseInt(String(f.line ?? ""), 10);
      const startRaw =
        typeof f.startLine === "number"
          ? f.startLine
          : Number.parseInt(String(f.startLine ?? ""), 10);
      const parsed = byPath.get(filePath);
      const line = snapToChangedLine(
        parsed,
        Number.isFinite(lineRaw) ? lineRaw : null,
      );
      const startLine = Number.isFinite(startRaw) ? startRaw : line;
      const title = String(f.title ?? "Issue").slice(0, 160);
      const body = String(f.body ?? "").slice(0, 2000);
      return {
        severity: groundSeverity(asSeverity(f.severity), title, body),
        category: String(f.category ?? "bug").slice(0, 40),
        filePath,
        line,
        startLine: startLine && startLine > 0 ? startLine : line,
        title,
        body,
        suggestion: f.suggestion ? String(f.suggestion).slice(0, 2000) : null,
      };
    })
    .filter((f) => f.body && changedPaths.has(f.filePath) && f.line != null);

  const filesOut = Array.isArray(obj.files)
    ? obj.files
        .slice(0, 20)
        .map((item) => {
          const f = (item ?? {}) as Record<string, unknown>;
          return {
            path: String(f.path ?? ""),
            description: String(f.description ?? ""),
          };
        })
        .filter((f) => f.path)
    : files.slice(0, 12).map((f) => ({
        path: f.path,
        description: `${f.status} +${f.additions}/-${f.deletions}`,
      }));

  const effortNum = Number(obj.effort);
  return {
    summary: String(obj.summary ?? "Review complete.").slice(0, 800),
    walkthrough: String(obj.walkthrough ?? "").slice(0, 8000),
    effort: Number.isFinite(effortNum)
      ? Math.min(5, Math.max(1, Math.round(effortNum)))
      : 3,
    files: filesOut,
    findings,
  };
}

export async function runGrokReview(prompt: string): Promise<unknown> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("AI is not available in this environment");

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.05,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`xAI API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  return extractJson(content);
}
