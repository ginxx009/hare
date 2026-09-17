const HARE_BOT = /^hare-bot$/i;

const PR_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
  "review_requested",
]);

export function isHareBotLogin(login: string | null | undefined): boolean {
  return Boolean(login && HARE_BOT.test(login.trim()));
}

export function mentionsHareBot(body: string | null | undefined): boolean {
  if (!body) return false;
  return /@hare-bot\b/i.test(body);
}

export function isBotCommentAuthor(login: string | null | undefined): boolean {
  return isHareBotLogin(login);
}

export function shouldHandlePullAction(
  action: string,
  requestedLogin?: string | null,
): boolean {
  if (!PR_ACTIONS.has(action)) return false;
  if (action === "review_requested") return isHareBotLogin(requestedLogin);
  return true;
}
