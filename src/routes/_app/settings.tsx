import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { connectGithub, disconnectGithub, getDashboard, patchWatched } from "@/lib/hare/server";
import { IGNORE_HELP } from "@/lib/hare/ignore";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function copy(text: string, label: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

function SettingsPage() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const [token, setToken] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const connect = useMutation({
    mutationFn: () => connectGithub({ data: { token } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setToken("");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Connected as @${res.login}`);
    },
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectGithub(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Disconnected GitHub");
    },
  });
  const saveIgnore = useMutation({
    mutationFn: (input: { id: number; ignoreGlobs: string }) => patchWatched({ data: input }),
    onSuccess: () => toast.success("Ignore globs saved"),
  });

  const connection = dash.data?.connection;
  const webhookUrl = `${origin}/api/github/webhook`;
  const actionUrl = `${origin}/api/github/action`;
  const firstWatch = dash.data?.watched[0];

  const workflow = `name: hare-review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Request Hare review
        env:
          HARE_SECRET: \${{ secrets.HARE_SECRET }}
        run: |
          curl -sS -X POST "${actionUrl}" \\
            -H "Content-Type: application/json" \\
            -H "X-Hare-Secret: $HARE_SECRET" \\
            -d '{"owner":"\${{ github.repository_owner }}","repo":"\${{ github.event.repository.name }}","pull_number":\${{ github.event.pull_request.number }}}'
`;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          Fine-grained PAT as <span className="font-[family-name:var(--font-mono)]">hare-bot</span>:
          resource owner <strong>Joe-Solutions</strong> (the org, not the user), repository access{" "}
          <strong>All repositories</strong>, Contents read, Pull requests read and write, Commit
          statuses write, Metadata read. Public-only tokens hide every private repo.
        </p>
      </div>

      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <h2 className="font-medium">GitHub token</h2>
        {connection ? (
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Connected as <span className="text-[var(--color-fg)]">@{connection.githubLogin}</span>
            {" · "}
            ending {connection.tokenLast4}
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Not connected. Tokens are stored on the server and never sent back to the browser.
          </p>
        )}
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            connect.mutate();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            placeholder="ghp_… or github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button type="submit" disabled={connect.isPending || !token.trim()}>
            {connection ? "Replace" : "Connect"}
          </Button>
        </form>
        {connection ? (
          <Button
            className="mt-3"
            variant="danger"
            size="sm"
            onClick={() => disconnect.mutate()}
          >
            Disconnect
          </Button>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <h2 className="font-medium">Webhook</h2>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          After you publish this app, add a repository webhook for Pull requests pointing at this URL. Use the secret shown for a watched repo.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            className="truncate rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-2 text-left font-[family-name:var(--font-mono)] text-xs"
            onClick={() => copy(webhookUrl, "Webhook URL")}
          >
            {webhookUrl || "/api/github/webhook"}
          </button>
          {firstWatch ? (
            <button
              type="button"
              className="truncate rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-2 text-left font-[family-name:var(--font-mono)] text-xs"
              onClick={() => copy(firstWatch.webhookSecret, "Webhook secret")}
            >
              secret · {firstWatch.owner}/{firstWatch.repo} · tap to copy
            </button>
          ) : (
            <p className="text-xs text-[var(--color-fg-subtle)]">
              Watch a repository to generate a per-repo webhook secret.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <h2 className="font-medium">GitHub Action</h2>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          Store <span className="font-[family-name:var(--font-mono)] text-xs">HARE_SECRET</span> as a repo secret, then add this workflow.
        </p>
        {connection ? (
          <button
            type="button"
            className="mt-3 w-full truncate rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-3 py-2 text-left font-[family-name:var(--font-mono)] text-xs"
            onClick={() => copy(connection.actionSecret, "Action secret")}
          >
            HARE_SECRET · tap to copy
          </button>
        ) : null}
        <pre className="mt-3 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3 font-[family-name:var(--font-mono)] text-[11px] leading-5 text-[var(--color-fg-muted)]">
          {workflow}
        </pre>
      </section>

      {(dash.data?.watched ?? []).length > 0 ? (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
          <h2 className="font-medium">Ignore globs</h2>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{IGNORE_HELP}</p>
          {dash.data?.watched.map((repo) => (
            <IgnoreEditor
              key={repo.id}
              owner={repo.owner}
              name={repo.repo}
              value={repo.ignoreGlobs}
              onSave={(ignoreGlobs) =>
                saveIgnore.mutate({ id: repo.id, ignoreGlobs })
              }
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function IgnoreEditor({
  owner,
  name,
  value,
  onSave,
}: {
  owner: string;
  name: string;
  value: string;
  onSave: (next: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="mt-4">
      <p className="mb-2 font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-subtle)]">
        {owner}/{name}
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} />
      <Button className="mt-2" size="sm" variant="secondary" onClick={() => onSave(text)}>
        Save
      </Button>
    </div>
  );
}
