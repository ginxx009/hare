import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { HareWordmark } from "@/components/logo";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
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
    <main className="grid min-h-dvh place-items-center bg-[var(--color-bg)] px-6 pb-16">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/">
          <HareWordmark />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-fg)]">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Reviews stay scoped to your account. GitHub tokens never leave the server.
          </p>
          <p className="mt-2 text-sm text-[var(--color-fg-subtle)]">
            Prefer a look first?{" "}
            <Link to="/demo" className="underline-offset-4 hover:underline">
              See a sample review
            </Link>
            .
          </p>
        </div>
        {authEnabled ? (
          <div className="flex flex-col gap-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                variant="secondary"
                onClick={() => signIn(p.providerId, { callbackURL: "/inbox" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-fg-muted)]">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}
