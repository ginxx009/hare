import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-6 w-10 rounded-full border transition-colors duration-150",
        checked
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-150",
          checked
            ? "translate-x-4 bg-[var(--color-accent-fg)]"
            : "translate-x-0 bg-[var(--color-fg-muted)]",
        )}
      />
    </button>
  );
}
