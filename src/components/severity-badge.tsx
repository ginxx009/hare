import type { Severity } from "@/lib/hare/types";
import { cn } from "@/lib/utils";

const STYLES: Record<Severity, string> = {
  critical:
    "border-[color-mix(in_oklab,var(--color-danger)_50%,transparent)] text-[var(--color-danger)]",
  major:
    "border-[color-mix(in_oklab,var(--color-warn)_50%,transparent)] text-[var(--color-warn)]",
  minor:
    "border-[color-mix(in_oklab,var(--color-info)_50%,transparent)] text-[var(--color-info)]",
  nit: "border-[var(--color-border)] text-[var(--color-fg-muted)]",
};

export function SeverityBadge({
  severity,
  count,
}: {
  severity: Severity;
  count?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        STYLES[severity],
      )}
    >
      {severity}
      {typeof count === "number" ? (
        <span className="font-[family-name:var(--font-mono)] tabular-nums">{count}</span>
      ) : null}
    </span>
  );
}
