import { cn } from "@/lib/utils";

export function HareMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      aria-hidden="true"
    >
      <path
        d="M10 14c-1.2-5 1.2-10 3.6-11.2 1.1 3.4-.1 6.8-1.4 8.6M22 14c1.2-5-1.2-10-3.6-11.2-1.1 3.4.1 6.8 1.4 8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="18.5" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="13.6" cy="17.4" r="1.1" fill="currentColor" />
      <circle cx="18.4" cy="17.4" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function HareWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-[var(--color-fg)]", className)}>
      <HareMark />
      <span className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight">
        Hare
      </span>
    </span>
  );
}
