export type DiffLine = {
  type: "hunk" | "add" | "del" | "ctx" | "meta";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

export type ParsedFileDiff = {
  path: string;
  oldPath: string | null;
  lines: DiffLine[];
  addedLines: Set<number>;
  newLineCount: number;
};

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(diff: string): ParsedFileDiff[] {
  const files: ParsedFileDiff[] = [];
  let current: ParsedFileDiff | null = null;
  let oldLine = 0;
  let newLine = 0;

  const raw = diff.replace(/\r\n/g, "\n").split("\n");
  for (const line of raw) {
    if (line.startsWith("diff --git ")) {
      current = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "");
      if (path === "/dev/null") continue;
      current = {
        path,
        oldPath: null,
        lines: [],
        addedLines: new Set(),
        newLineCount: 0,
      };
      files.push(current);
      continue;
    }
    if (line.startsWith("--- ") && current) {
      const path = line.slice(4).replace(/^a\//, "");
      current.oldPath = path === "/dev/null" ? null : path;
      continue;
    }
    if (!current) continue;

    const hunk = HUNK_RE.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      current.lines.push({
        type: "hunk",
        text: line,
        oldLine: null,
        newLine: null,
      });
      continue;
    }
    if (line.startsWith("+")) {
      current.addedLines.add(newLine);
      current.lines.push({
        type: "add",
        text: line.slice(1),
        oldLine: null,
        newLine,
      });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      current.lines.push({
        type: "del",
        text: line.slice(1),
        oldLine,
        newLine: null,
      });
      oldLine += 1;
      continue;
    }
    if (line.startsWith("\\")) {
      current.lines.push({
        type: "meta",
        text: line,
        oldLine: null,
        newLine: null,
      });
      continue;
    }
    if (line.startsWith(" ")) {
      current.lines.push({
        type: "ctx",
        text: line.slice(1),
        oldLine,
        newLine,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  for (const file of files) {
    let max = 0;
    for (const n of file.addedLines) max = Math.max(max, n);
    file.newLineCount = max;
  }
  return files;
}

export function snapToChangedLine(
  file: ParsedFileDiff | undefined,
  line: number | null,
): number | null {
  if (!file || line == null || line < 1) return null;
  if (file.addedLines.has(line)) return line;
  let best: number | null = null;
  let bestDist = 8;
  for (const n of file.addedLines) {
    const d = Math.abs(n - line);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export function truncateDiff(diff: string, maxChars = 40_000): string {
  if (diff.length <= maxChars) return diff;
  return `${diff.slice(0, maxChars)}\n\n… [diff truncated for review]`;
}
