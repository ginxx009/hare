import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { SeverityBadge } from "@/components/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, syncInbox } from "@/lib/hare/server";
import type { PullRequest, Severity } from "@/lib/hare/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

function severityCounts(pr: PullRequest) {
  const counts: Record<Severity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    nit: 0,
  };
  for (const f of pr.latestReview?.findings ?? []) counts[f.severity] += 1;
  return counts;
}

function InboxPage() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const sync = useMutation({
    mutationFn: () => syncInbox(),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (res.errors?.length) {
        toast.error(res.errors[0] ?? "Sync failed");
        return;
      }
      toast.success(
        res.pulled
          ? `Synced ${res.pulled} pull requests · ${res.reviewed} reviewed`
          : "Inbox is current",
      );
    },
    onError: () => toast.error("Sync failed"),
  });

  if (dash.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const pulls = dash.data?.pulls ?? [];
  const connected = Boolean(dash.data?.connection);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-fg)]">
            Inbox
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-fg-muted)]">
            {connected
              ? `Connected as @${dash.data?.connection?.githubLogin}. Open PRs on watched repos review automatically.`
              : "A sample pull request is ready. Connect GitHub in Settings to review your own repos."}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          <RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "Syncing" : "Sync"}
        </Button>
      </div>

      {!connected ? (
        <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
          <p className="text-sm text-[var(--color-fg-muted)]">
            Add a GitHub personal access token, watch a repository, then paste the webhook URL from Settings. Until then, inspect the sample review below.
          </p>
          <Link to="/settings" className="mt-3 inline-block">
            <Button size="sm">Connect GitHub</Button>
          </Link>
        </div>
      ) : null}

      <ul className="mt-8 flex flex-col gap-3">
        {pulls.map((pr) => {
          const counts = severityCounts(pr);
          const status = pr.latestReview?.status ?? "queued";
          return (
            <li key={pr.id}>
              <Link
                to="/pr/$owner/$repo/$number"
                params={{
                  owner: pr.owner,
                  repo: pr.repo,
                  number: String(pr.number),
                }}
                className="block rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 transition-colors duration-150 hover:border-[var(--color-border-strong)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-subtle)]">
                    {pr.owner}/{pr.repo}#{pr.number}
                  </span>
                  {pr.isDemo ? <Badge>Sample</Badge> : null}
                  <Badge className="capitalize">{status}</Badge>
                  {pr.latestReview?.posted ? <Badge>Posted</Badge> : null}
                </div>
                <h2 className="mt-2 text-lg font-medium text-[var(--color-fg)]">{pr.title}</h2>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  {pr.author} · {pr.headRef} → {pr.baseRef} · +{pr.additions} / −{pr.deletions}
                </p>
                {pr.latestReview?.status === "complete" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["critical", "major", "minor", "nit"] as Severity[]).map((s) =>
                      counts[s] ? <SeverityBadge key={s} severity={s} count={counts[s]} /> : null,
                    )}
                    {pr.latestReview.effort ? (
                      <span className="text-xs text-[var(--color-fg-subtle)]">
                        Effort {pr.latestReview.effort}/5
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
