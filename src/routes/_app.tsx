import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="min-h-dvh bg-[var(--color-bg)] p-8 text-[var(--color-fg-muted)]">
        <p className="text-sm">Loading Hare…</p>
        <Skeleton className="mt-6 h-8 w-40" />
        <Skeleton className="mt-8 h-40 w-full" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
