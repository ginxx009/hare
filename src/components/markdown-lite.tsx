import { cn } from "@/lib/utils";

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-[var(--radius-xs)] bg-[var(--color-bg-subtle)] px-1 py-0.5 font-[family-name:var(--font-mono)] text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium text-[var(--color-fg)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={cn("space-y-3 text-sm leading-6 text-[var(--color-fg-muted)]", className)}>
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const inner = block.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-fg)]"
            >
              {inner}
            </pre>
          );
        }
        if (block.startsWith("### ") || block.startsWith("## ")) {
          const lines = block.split("\n");
          const first = lines[0] ?? "";
          const rest = lines.slice(1).join(" ").trim();
          const isH2 = first.startsWith("## ") && !first.startsWith("### ");
          const title = isH2 ? first.slice(3) : first.slice(4);
          return (
            <div key={i} className="space-y-2">
              {isH2 ? (
                <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-fg)]">
                  {title}
                </h2>
              ) : (
                <h3 className="pt-2 text-base font-medium text-[var(--color-fg)]">{title}</h3>
              )}
              {rest ? <p>{renderInline(rest)}</p> : null}
            </div>
          );
        }
        if (block.startsWith("|")) {
          const rows = block
            .split("\n")
            .filter((r) => r.trim() && !/^\|?\s*-+/.test(r));
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-[var(--color-border)]">
                      {row
                        .split("|")
                        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
                        .map((cell, ci) => (
                          <td key={ci} className="py-1.5 pr-3">
                            {renderInline(cell.trim())}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.split("\n").every((l) => l.startsWith("- ") || l.startsWith("* "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.split("\n").map((line, li) => (
                <li key={li}>{renderInline(line.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}
