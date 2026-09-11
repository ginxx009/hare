import { SeverityBadge } from "@/components/severity-badge";
import type { Finding, Severity } from "@/lib/hare/types";

const ORDER: Severity[] = ["critical", "major", "minor", "nit"];

export function FindingList({
  findings,
  onJump,
}: {
  findings: Finding[];
  onJump?: (finding: Finding) => void;
}) {
  const sorted = [...findings].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
  );
  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        No findings on this head commit.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => onJump?.(f)}
            className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-left transition-colors duration-150 hover:border-[var(--color-border-strong)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={f.severity} />
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                {f.category}
              </span>
            </div>
            <p className="mt-2 font-medium text-[var(--color-fg)]">{f.title}</p>
            <p className="mt-1 font-[family-name:var(--font-mono)] text-xs text-[var(--color-fg-subtle)]">
              {f.filePath}
              {f.line ? `:${f.line}` : ""}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-fg-muted)]">{f.body}</p>
            {f.suggestion ? (
              <pre className="mt-3 overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--color-bg)] p-3 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-fg)]">
                {f.suggestion}
              </pre>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
