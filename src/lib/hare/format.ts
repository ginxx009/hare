import type { Finding, ReviewerOutput, Severity } from "./types";

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "nit"];

function countBy(findings: Array<{ severity: Severity }>) {
  const counts: Record<Severity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    nit: 0,
  };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function formatGithubReviewBody(
  output: Pick<ReviewerOutput, "summary" | "walkthrough" | "effort" | "files">,
  findings: Array<Pick<Finding, "severity" | "title">>,
): string {
  const counts = countBy(findings);
  const chips = SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(" · ");

  const fileRows =
    output.files.length === 0
      ? "_No notable file groups._"
      : output.files
          .map((f) => `| \`${f.path}\` | ${f.description.replace(/\|/g, "\\|")} |`)
          .join("\n");

  return `## Hare review

${output.summary}

**Review effort:** ${output.effort} / 5
**Findings:** ${chips || "none"}

${output.walkthrough}

### Files

| File | What changed |
| --- | --- |
${fileRows}

---
*Posted automatically by [Hare](/) when this pull request opened or updated. Reply on a finding if it is a false positive.*
`;
}

export function formatInlineComment(
  finding: Pick<Finding, "severity" | "title" | "body" | "suggestion">,
): string {
  const label = finding.severity[0]?.toUpperCase() + finding.severity.slice(1);
  const suggestion = finding.suggestion
    ? `\n\n\`\`\`suggestion\n${finding.suggestion}\n\`\`\``
    : "";
  return `**${label}: ${finding.title}**\n\n${finding.body}${suggestion}`;
}

export function reviewEvent(
  findings: Array<{ severity: Severity }>,
): "COMMENT" | "REQUEST_CHANGES" {
  return findings.some((f) => f.severity === "critical" || f.severity === "major")
    ? "REQUEST_CHANGES"
    : "COMMENT";
}

export function hareGate(findings: Array<{ severity: Severity }>): {
  state: "success" | "failure";
  description: string;
} {
  const blocking = findings.filter(
    (f) => f.severity === "critical" || f.severity === "major",
  );
  if (blocking.length) {
    return {
      state: "failure",
      description: `${blocking.length} blocking (critical/major) — cannot merge`,
    };
  }
  const n = findings.length;
  return {
    state: "success",
    description: n ? `${n} non-blocking finding(s)` : "No blocking findings",
  };
}
