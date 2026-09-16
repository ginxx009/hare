/** Conversation or inline comment that asks hare-bot to (re)review. */
export function mentionsHareBot(body: string | null | undefined): boolean {
  return /@hare-bot\b/i.test(body ?? "");
}

export function isBotCommentAuthor(login: string | null | undefined): boolean {
  return /^hare-bot$/i.test((login ?? "").trim());
}
