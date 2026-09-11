import { parseUnifiedDiff, type DiffLine, type ParsedFileDiff } from "@/lib/hare/diff";
import type { Finding } from "@/lib/hare/types";
import { cn } from "@/lib/utils";

function lineFindings(findings: Finding[], path: string, line: number | null) {
  if (line == null) return [];
  return findings.filter((f) => f.filePath === path && f.line === line);
}

function LineRow({
  line,
  path,
  findings,
}: {
  line: DiffLine;
  path: string;
  findings: Finding[];
}) {
  if (line.type === "hunk" || line.type === "meta") {
    return (
      <div className="bg-[var(--color-bg-subtle)] px-3 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-fg-subtle)]">
        {line.text}
      </div>
    );
  }
  const hits = lineFindings(findings, path, line.newLine);
  return (
    <div>
      <div
        className={cn(
          "grid grid-cols-[3rem_1fr] gap-3 px-3 py-0.5 font-[family-name:var(--font-mono)] text-[12px] leading-5",
          line.type === "add" &&
            "bg-[color-mix(in_oklab,var(--color-ok)_12%,transparent)]",
          line.type === "del" &&
            "bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)]",
          hits.length > 0 && "outline outline-1 outline-[var(--color-warn)]/40",
        )}
      >
        <span className="tabular-nums text-[var(--color-fg-subtle)]">
          {line.newLine ?? line.oldLine ?? ""}
        </span>
        <span className="whitespace-pre-wrap break-all text-[var(--color-fg)]">
          <span className="mr-2 text-[var(--color-fg-subtle)]">
            {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
          </span>
          {line.text || " "}
        </span>
      </div>
      {hits.map((f) => (
        <div
          key={f.id}
          className="border-l-2 border-[var(--color-warn)] bg-[var(--color-bg-elevated)] px-4 py-2 text-sm"
        >
          <p className="font-medium text-[var(--color-fg)]">{f.title}</p>
          <p className="mt-1 text-[var(--color-fg-muted)]">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

function FileBlock({
  file,
  findings,
}: {
  file: ParsedFileDiff;
  findings: Finding[];
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <header className="border-b border-[var(--color-border)] px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-muted)]">
        {file.path}
      </header>
      <div className="max-h-[480px] overflow-auto">
        {file.lines.map((line, i) => (
          <LineRow key={`${file.path}-${i}`} line={line} path={file.path} findings={findings} />
        ))}
      </div>
    </section>
  );
}

export function DiffView({
  diff,
  findings,
}: {
  diff: string;
  findings: Finding[];
}) {
  const files = parseUnifiedDiff(diff);
  if (files.length === 0) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">No diff available.</p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {files.map((file) => (
        <FileBlock key={file.path} file={file} findings={findings} />
      ))}
    </div>
  );
}
