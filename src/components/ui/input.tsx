import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--color-border-strong)] focus:ring-2 focus:ring-[color:var(--color-accent)]/30",
        className,
      )}
      {...props}
    />
  );
}
