import { useSyncExternalStore } from "react";

/** Build flag for self-hosted owner sign-in (access key + authenticator code). */
export const ownerAuthMode = import.meta.env.VITE_HARE_OWNER_AUTH === "true";

type OwnerSession = { isPending: boolean; signedIn: boolean };

let snapshot: OwnerSession = { isPending: true, signedIn: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: OwnerSession) {
  snapshot = next;
  for (const l of listeners) l();
}

function refresh(): Promise<void> {
  loading ??= fetch("/api/owner/session", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ signedIn?: boolean }>) : { signedIn: false }))
    .then((b) => set({ isPending: false, signedIn: b.signedIn === true }))
    .catch(() => set({ isPending: false, signedIn: false }))
    .finally(() => {
      loading = null;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (snapshot.isPending) void refresh();
  return () => listeners.delete(listener);
}

const serverSnapshot: OwnerSession = { isPending: true, signedIn: false };

export function useOwnerSession(): OwnerSession {
  return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
}

/** Returns an error message, or null on success. */
export async function signInOwner(accessKey: string, code: string): Promise<string | null> {
  const res = await fetch("/api/owner/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessKey, code }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message ?? "Sign-in failed.";
  }
  await refresh();
  return null;
}

export async function signOutOwner(): Promise<void> {
  await fetch("/api/owner/logout", { method: "POST", credentials: "same-origin" });
  set({ isPending: false, signedIn: false });
  window.location.assign("/login");
}
