import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { DiffView } from "@/components/diff-view";
import { FindingList } from "@/components/finding-list";
import { MarkdownLite } from "@/components/markdown-lite";
import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPullDetail, runReview } from "@/lib/hare/server";
import type { Finding, Severity } from "@/lib/hare/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pr/$owner/$repo/$number")({
  component: PullPage,
});

type Tab = "walkthrough" | "findings" | "files";

function PullPage() {
  const { owner, repo, number } = Route.useParams();
  const n = Number(number);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("walkthrough");
  const detail = useQuery({
    queryKey: ["pull", owner, repo, n],
    queryFn: () => getPullDetail({ data: { owner, repo, number: n } }),
  });
  const review = useMutation({
    mutationFn: (opts?: { force?: boolean; useLiveModel?: boolean }) =>
      runReview({
        data: {
          owner,
          repo,
          number: n,
          force: opts?.force,
          useLiveModel: opts?.useLiveModel,
        },
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["pull", owner, repo, n] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (!res.ok) toast.error(res.error ?? "Review failed");
      else toast.success("Review complete");
    },
  });

  const pull = detail.data?.pull;
  const findings = pull?.latestReview?.findings ?? [];
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, major: 0, minor: 0, nit: 0 };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!pull) {
    return (
      <div>
        <p className="text-sm text-[var(--color-fg-muted)]">Pull request not in the inbox yet.</p>
        <Link to="/inbox" className="mt-4 inline-block text-sm underline">
          Back to inbox
        </Link>
      </div>
    );
  }

  const filesSummary = (() => {
    try {
      return JSON.parse(pull.latestReview?.filesJson ?? "[]") as Array<{
        path: string;
        description: string;
      }>;
    } catch {
      return [];
    }
  })();

  return (
    <div>
      <Link
        to="/inbox"
        className="inline-flex h-11 items-center gap-2 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-4" />
        Inbox
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-subtle)]">
            {pull.owner}/{pull.repo}#{pull.number}
          </p>
          <h1 className="mt-1 max-w-3xl font-[family-name:var(--font-display)] text-3xl leading-tight sm:text-4xl">
            {pull.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pull.isDemo ? <Badge>Sample</Badge> : null}
            <Badge className="capitalize">{pull.latestReview?.status ?? "queued"}</Badge>
            {pull.latestReview?.posted ? <Badge>Posted to GitHub</Badge> : null}
            {pull.latestReview?.incremental ? <Badge>Incremental</Badge> : null}
            {pull.latestReview?.effort ? (
              <span className="text-xs text-[var(--color-fg-subtle)]">
                Effort {pull.latestReview.effort}/5
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pull.isDemo ? (
            <Button
              variant="secondary"
              disabled={review.isPending}
              onClick={() => review.mutate({ force: true, useLiveModel: true })}
            >
              {review.isPending ? "Reviewing…" : "Re-run with Grok"}
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={review.isPending}
              onClick={() => review.mutate({ force: true })}
            >
              {review.isPending ? "Reviewing…" : "Re-review"}
            </Button>
          )}
          {pull.htmlUrl.startsWith("http") && !pull.isDemo ? (
            <a href={pull.htmlUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost">Open on GitHub</Button>
            </a>
          ) : null}
        </div>
      </div>

      {pull.latestReview?.error ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {pull.latestReview.error}
        </p>
      ) : null}
      {pull.latestReview?.postError ? (
        <p className="mt-3 text-sm text-[var(--color-warn)]">{pull.latestReview.postError}</p>
      ) : null}

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
            {pull.latestReview?.summary ? (
              <p className="max-w-3xl text-base leading-7 text-[var(--color-fg)]">
                {pull.latestReview.summary}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-fg-muted)]">No walkthrough yet.</p>
            )}
            {pull.latestReview?.walkthrough ? (
              <MarkdownLite text={pull.latestReview.walkthrough} />
            ) : null}
            {filesSummary.length > 0 ? (
              <table className="w-full max-w-3xl text-left text-sm">
                <thead>
                  <tr className="text-[var(--color-fg-subtle)]">
                    <th className="py-2 font-medium">File</th>
                    <th className="py-2 font-medium">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {filesSummary.map((f) => (
                    <tr key={f.path} className="border-t border-[var(--color-border)]">
                      <td className="py-2 pr-4 font-[family-name:var(--font-mono)] text-xs">
                        {f.path}
                      </td>
                      <td className="py-2 text-[var(--color-fg-muted)]">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}

        {tab === "findings" ? (
          <FindingList
            findings={findings}
            onJump={(f: Finding) => {
              setTab("files");
              void f;
            }}
          />
        ) : null}

        {tab === "files" ? (
          detail.data?.diff ? (
            <DiffView diff={detail.data.diff} findings={findings} />
          ) : (
            <p className="text-sm text-[var(--color-fg-muted)]">Diff is not available.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
