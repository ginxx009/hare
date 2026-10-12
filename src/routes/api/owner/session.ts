import { createFileRoute } from "@tanstack/react-router";
import { ownerAuthEnabled, ownerFromRequest } from "@/lib/auth/owner.server";

async function get({ request }: { request: Request }) {
  const signedIn = ownerAuthEnabled() && ownerFromRequest(request) !== null;
  return Response.json({ signedIn }, { headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/owner/session")({
  server: { handlers: { GET: get } },
});
