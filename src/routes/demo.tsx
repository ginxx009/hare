import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { DiffView } from "@/components/diff-view";
import { FindingList } from "@/components/finding-list";
import { HareWordmark } from "@/components/logo";
import { MarkdownLite } from "@/components/markdown-lite";
import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_DIFF, DEMO_PR, DEMO_REVIEW } from "@/lib/hare/demo";
import { parseUnifiedDiff, snapToChangedLine } from "@/lib/hare/diff";
import type { Finding, Severity } from "@/lib/hare/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo")({ component: DemoPage });

type Tab = "walkthrough" | "findings" | "files";

function demoFindings(): Finding[] {
  const parsed = parseUnifiedDiff(DEMO_DIFF);
  return DEMO_REVIEW.findings.map((f, i) => {
    const file = parsed.find((p) => p.path === f.filePath);
    const line = snapToChangedLine(file, f.line);
    return {
      id: i + 1,
      severity: f.severity,
      category: f.category,
      filePath: f.filePath,
      line,
      startLine: f.startLine ?? line,
      title: f.title,
      body: f.body,
      suggestion: f.suggestion,
      posted: true,
    };
  });
}

function DemoPage() {
  const [tab, setTab] = useState<Tab>("walkthrough");
  const findings = useMemo(() => demoFindings(), []);
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, major: 0, minor: 0, nit: 0 };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  return (
    <main className="min-h-dvh bg-[var(--color-bg)] pb-20 text-[var(--color-fg)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 pr-36">
        <Link to="/">
          <HareWordmark />
        </Link>
        <Link to="/login">
          <Button variant="secondary" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-6">
        <Link
          to="/"
          className="inline-flex h-11 items-center gap-2 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <p className="mt-4 font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-subtle)]">
          {DEMO_PR.owner}/{DEMO_PR.repo}#{DEMO_PR.number}
        </p>
        <h1 className="mt-1 max-w-3xl font-[family-name:var(--font-display)] text-3xl leading-tight sm:text-4xl">
          {DEMO_PR.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge>Sample</Badge>
          <Badge>Posted to GitHub</Badge>
          <span className="text-xs text-[var(--color-fg-subtle)]">
            Effort {DEMO_REVIEW.effort}/5
          </span>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-[var(--color-fg-muted)]">
          This is a canned review of an intentionally broken checkout PR. Connect GitHub after sign-in and Hare will do this on every real pull request — then post it back.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["critical", "major", "minor", "nit"] as Severity[]).map((s) =>
            counts[s] ? <SeverityBadge key={s} severity={s} count={counts[s]} /> : null,
          )}
        </div>

        <div className="mt-8 flex gap-2 border-b border-[var(--color-border)]">
          {(
            [
              ["walkthrough", "Walkthrough"],
              ["findings", `Findings (${findings.length})`],
              ["files", "Files"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "h-11 px-3 text-sm transition-colors duration-150",
                tab === id
                  ? "border-b-2 border-[var(--color-fg)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "walkthrough" ? (
            <div className="space-y-6">
              <p className="max-w-3xl text-base leading-7">{DEMO_REVIEW.summary}</p>
              <MarkdownLite text={DEMO_REVIEW.walkthrough} />
            </div>
          ) : null}
          {tab === "findings" ? (
            <FindingList
              findings={findings}
              onJump={() => setTab("files")}
            />
          ) : null}
          {tab === "files" ? <DiffView diff={DEMO_DIFF} findings={findings} /> : null}
        </div>
      </div>
    </main>
  );
}
