import { createFileRoute } from "@tanstack/react-router";
import { clearedOwnerCookie, isSecureRequest } from "@/lib/auth/owner.server";

async function post({ request }: { request: Request }) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ ok: false }, { status: 403 });
  }
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": clearedOwnerCookie(isSecureRequest(request)) } },
  );
}

export const Route = createFileRoute("/api/owner/logout")({
  server: { handlers: { POST: post } },
});
