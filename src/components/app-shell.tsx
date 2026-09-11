import { Link, useRouterState } from "@tanstack/react-router";
import { GitPullRequest, Inbox, Menu, Settings2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { HareWordmark } from "./logo";

const NAV = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/repos", label: "Repositories", icon: GitPullRequest },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onClick}
            className={cn(
              "flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm transition-colors duration-150",
              active
                ? "bg-[var(--color-bg-subtle)] text-[var(--color-fg)]"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]",
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isPending } = useCurrentUserState();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-border)] p-5 md:flex">
          <Link to="/inbox" className="mb-8">
            <HareWordmark />
          </Link>
          <NavLinks />
          <div className="mt-auto pt-6">
            {isPending ? (
              <div className="h-8 w-36 animate-pulse rounded-full bg-[var(--color-bg-subtle)]" />
            ) : (
              <UserButton />
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 md:hidden">
            <Link to="/inbox">
              <HareWordmark />
            </Link>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-[var(--radius-sm)] text-[var(--color-fg)]"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </header>
          {open ? (
            <div className="border-b border-[var(--color-border)] px-4 py-3 md:hidden">
              <NavLinks onClick={() => setOpen(false)} />
              <div className="mt-4">
                <UserButton />
              </div>
            </div>
          ) : null}
          <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
