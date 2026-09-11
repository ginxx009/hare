const DEFAULT_IGNORES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "go.sum",
  "cargo.lock",
  "poetry.lock",
  "composer.lock",
  "dist/",
  "build/",
  "coverage/",
  ".next/",
  "node_modules/",
  "vendor/",
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.lock",
  "*.svg",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.pdf",
];

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DOUBLE§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLE§/g, ".*");
  if (glob.endsWith("/")) {
    return new RegExp(`(^|/)${escaped}`);
  }
  return new RegExp(`(^|/)${escaped}$`, "i");
}

export function shouldIgnorePath(path: string, extraGlobs = ""): boolean {
  const globs = [
    ...DEFAULT_IGNORES,
    ...extraGlobs
      .split(/[\n,]/)
      .map((g) => g.trim())
      .filter(Boolean),
  ];
  return globs.some((g) => globToRegExp(g).test(path));
}

export const IGNORE_HELP =
  "Lockfiles, generated folders, images, and minified assets are skipped by default. Add extra globs, one per line.";
