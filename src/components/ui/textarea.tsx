import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--color-border-strong)] focus:ring-2 focus:ring-[color:var(--color-accent)]/30",
        className,
      )}
      {...props}
    />
  );
}
