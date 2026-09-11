import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  getDashboard,
  listAvailableRepos,
  patchWatched,
  unwatchRepo,
  watchRepo,
} from "@/lib/hare/server";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/repos")({
  component: ReposPage,
});

function ReposPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [manual, setManual] = useState("");
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const available = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => listAvailableRepos(),
    enabled: Boolean(dash.data?.connection),
  });

  const watch = useMutation({
    mutationFn: (input: { owner: string; repo: string }) => watchRepo({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Watching repository");
    },
  });
  const unwatch = useMutation({
    mutationFn: (id: number) => unwatchRepo({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Stopped watching");
    },
  });
  const patch = useMutation({
    mutationFn: (input: { id: number; autoPost?: boolean; autoReview?: boolean }) =>
      patchWatched({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const watchedKeys = useMemo(() => {
    return new Set((dash.data?.watched ?? []).map((w) => `${w.owner}/${w.repo}`));
  }, [dash.data?.watched]);

  const filtered = (available.data?.repos ?? []).filter((r) =>
    r.fullName.toLowerCase().includes(q.toLowerCase()),
  );
  const listed = available.data?.repos ?? [];
  const onlyPublic = listed.length > 0 && listed.every((r) => !r.private);

  function watchManual() {
    const raw = manual.trim().replace(/^https:\/\/github\.com\//, "");
    const [owner, repo] = raw.split("/").map((p) => p.trim());
    if (!owner || !repo) {
      toast.error("Use owner/repo, e.g. Joe-Solutions/JOSIE");
      return;
    }
    watch.mutate(
      { owner, repo: repo.replace(/\.git$/, "") },
      { onSuccess: () => setManual("") },
    );
  }

  if (dash.isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Repositories</h1>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          Hare reviews open pull requests on watched repositories and posts back to GitHub.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
          Watching
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(dash.data?.watched ?? []).length === 0 ? (
            <li className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-sm text-[var(--color-fg-muted)]">
              Nothing watched yet.
            </li>
          ) : (
            dash.data?.watched.map((repo) => (
              <li
                key={repo.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
              >
                <div>
                  <p className="font-[family-name:var(--font-mono)] text-sm">
                    {repo.owner}/{repo.repo}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                    Auto-review {repo.autoReview ? "on" : "off"} · Auto-post {repo.autoPost ? "on" : "off"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
                    Post
                    <Switch
                      checked={repo.autoPost}
                      label="Auto-post reviews"
                      onCheckedChange={(next) =>
                        patch.mutate({ id: repo.id, autoPost: next })
                      }
                    />
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => unwatch.mutate(repo.id)}>
                    Unwatch
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
          Watch by name
        </h2>
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            watchManual();
          }}
        >
          <Input
            placeholder="Joe-Solutions/JOSIE"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" disabled={watch.isPending || !manual.trim()}>
            Watch
          </Button>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
            From GitHub
          </h2>
          <Input
            placeholder="Filter repositories"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </div>
        {!dash.data?.connection ? (
          <p className="mt-4 text-sm text-[var(--color-fg-muted)]">
            Connect GitHub in Settings to list repositories.
          </p>
        ) : available.isLoading ? (
          <Skeleton className="mt-4 h-32 w-full" />
        ) : (
          <>
            {onlyPublic || listed.length <= 1 ? (
              <p className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-sm text-[var(--color-fg-muted)]">
                This token only listed public repos. Recreate the hare-bot PAT with resource owner{" "}
                <span className="font-[family-name:var(--font-mono)]">Joe-Solutions</span> and
                repository access set to All repositories, then replace it in Settings.
              </p>
            ) : null}
            <ul className="mt-4 flex flex-col gap-2">
            {filtered.slice(0, 40).map((repo) => {
              const watching = watchedKeys.has(repo.fullName);
              return (
                <li
                  key={repo.fullName}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-mono)] text-sm">
                      {repo.fullName}
                    </p>
                    {repo.description ? (
                      <p className="truncate text-xs text-[var(--color-fg-subtle)]">
                        {repo.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant={watching ? "ghost" : "secondary"}
                    disabled={watching || watch.isPending}
                    onClick={() => watch.mutate({ owner: repo.owner, repo: repo.name })}
                  >
                    {watching ? "Watching" : "Watch"}
                  </Button>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </section>
    </div>
  );
}
