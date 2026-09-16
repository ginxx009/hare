/**
 * Project brief files, tried in order. Missing files are skipped.
 * `.github/claude/SYSTEM_PROFILE.md` is the Joe Solutions in-repo stamp/profile.
 */
export const PROJECT_BRIEF_PATHS = [
  ".github/claude/SYSTEM_PROFILE.md",
  "HARE.md",
  ".hare.md",
  "docs/HARE.md",
];

export function contextLoadOrder(path: string): number {
  if (path === ".github/claude/SYSTEM_PROFILE.md") return 0;
  if (/(^|\/)HARE\.md$/i.test(path) || path === ".hare.md") return 1;
  if (/schema\.prisma$/i.test(path)) return 2;
  return 3;
}

export function isProjectBrief(path: string): boolean {
  return (
    path === ".github/claude/SYSTEM_PROFILE.md" ||
    /(^|\/)HARE\.md$/i.test(path) ||
    path === ".hare.md"
  );
}
