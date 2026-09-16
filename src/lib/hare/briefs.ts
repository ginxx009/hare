/** Project brief files — loaded first. Never constitution.mdc / CLAUDE workspace profiles. */
export const PROJECT_BRIEF_PATHS = ["HARE.md", ".hare.md", "docs/HARE.md"];

export function contextLoadOrder(path: string): number {
  if (/(^|\/)HARE\.md$/i.test(path) || path === ".hare.md") return 0;
  if (/schema\.prisma$/i.test(path)) return 1;
  return 2;
}
