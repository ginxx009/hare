import { createFileRoute } from "@tanstack/react-router";
import {
  clientIdOf,
  isSecureRequest,
  ownerAuthEnabled,
  ownerSessionCookie,
  verifyOwnerLogin,
} from "@/lib/auth/owner.server";

function crossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return Boolean(site && site !== "same-origin" && site !== "none");
}

async function post({ request }: { request: Request }) {
  if (!ownerAuthEnabled()) return Response.json({ ok: false }, { status: 404 });
  if (crossSite(request)) return Response.json({ ok: false }, { status: 403 });
  let body: { accessKey?: unknown; code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }
  const accessKey = typeof body.accessKey === "string" ? body.accessKey.trim() : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  const result = verifyOwnerLogin(accessKey, code, clientIdOf(request));
  if (!result.ok) {
    const message =
      result.reason === "locked"
        ? "Too many attempts. Try again in 15 minutes."
        : "Access key or code is wrong.";
    return Response.json({ ok: false, message }, { status: result.reason === "locked" ? 429 : 401 });
  }
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": ownerSessionCookie(isSecureRequest(request)) } },
  );
}

export const Route = createFileRoute("/api/owner/login")({
  server: { handlers: { POST: post } },
});
