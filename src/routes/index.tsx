import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, GitPullRequest, RefreshCw, ShieldCheck } from "lucide-react";
import { HareWordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

const FEATURES = [
  {
    icon: GitPullRequest,
    title: "Lands on every PR",
    body: "Opened, updated, or marked ready — Hare reads the new diff and posts a review.",
  },
  {
    icon: RefreshCw,
    title: "Incremental, not noisy",
    body: "A new commit is reviewed against the last head. Unchanged findings stay put.",
  },
  {
    icon: ShieldCheck,
    title: "Security first",
    body: "Injection, auth gaps, races, and secrets rank above nits. Critical findings request changes.",
  },
];

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--color-bg)] text-[var(--color-fg-muted)]">
        <p className="text-sm">Loading Hare…</p>
      </main>
    );
  }
  if (user) return <Navigate to="/inbox" />;

  return (
    <main className="min-h-dvh bg-[var(--color-bg)] pb-16 text-[var(--color-fg)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 pr-36">
        <HareWordmark />
        <Link to="/demo">
          <Button variant="ghost" size="sm">
            Sample review
          </Button>
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-10 sm:pt-16">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          GitHub code review
        </p>
        <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.6rem,7vw,5.2rem)] leading-[0.95] tracking-tight">
          A reviewer that hops onto every pull request.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-fg-muted)] sm:text-lg">
          Hare watches the repos you choose, reads each new diff, and posts a walkthrough plus inline findings back to GitHub — automatically.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login">
            <Button size="lg">
              Open the inbox
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link to="/demo">
            <Button size="lg" variant="secondary">
              See a sample review
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <article
                key={f.title}
                className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
              >
                <Icon className="size-5 text-[var(--color-fg)]" strokeWidth={1.6} />
                <h2 className="mt-4 text-base font-medium">{f.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-fg-muted)]">{f.body}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
