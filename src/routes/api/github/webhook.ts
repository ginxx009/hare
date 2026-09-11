import { createFileRoute } from "@tanstack/react-router";
import { handleGithubWebhook } from "@/lib/hare/webhook";

async function post({ request }: { request: Request }) {
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventName = request.headers.get("x-github-event");
  const result = await handleGithubWebhook(payload, signature, eventName);
  return Response.json(result.body, { status: result.status });
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: {
      GET: () =>
        Response.json({ ok: true, message: "Hare webhook ready. POST pull_request events here." }),
      POST: post,
    },
  },
});
