import { useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { ownerAuthMode, signInOwner } from "@/lib/auth/owner-client";
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
        {ownerAuthMode ? (
          <OwnerSignIn />
        ) : authEnabled ? (
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

const inputClass =
  "w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm text-[var(--color-fg)] outline-none focus:border-[var(--color-fg-muted)]";

function OwnerSignIn() {
  const [accessKey, setAccessKey] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signInOwner(accessKey, code).catch(() => "Sign-in failed.");
    setBusy(false);
    if (message) {
      setError(message);
      setCode("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-[var(--color-fg-muted)]">
        Access key
        <input
          type="password"
          autoComplete="current-password"
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          className={inputClass}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-[var(--color-fg-muted)]">
        Authenticator code
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={inputClass}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
