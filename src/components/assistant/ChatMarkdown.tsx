import type { ReactNode } from "react";

/** **bold** and _italic_ inside a line (plain React text nodes: nothing is ever interpreted as HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isTableLine = (l: string) => l.trim().startsWith("|") && l.trim().endsWith("|");
const isDivider = (l: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l.trim());

/**
 * Renders the assistant's answer: paragraphs and lists as written, and markdown tables as real tables (the ingredient lists).
 */
export function ChatMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let text: string[] = [];
  const flushText = () => {
    const joined = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (joined) blocks.push(<div key={`t${blocks.length}`} className="whitespace-pre-wrap">{joined.split("\n").map((l, i, a) => <span key={i}>{inline(l)}{i < a.length - 1 ? "\n" : ""}</span>)}</div>);
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (isTableLine(lines[i]) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushText();
      const head = cells(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) rows.push(cells(lines[i++]));
      i--;
      blocks.push(
        <div key={`tb${blocks.length}`} className="my-1.5 overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="bg-surface-alt">
              <tr>
                {head.map((h, k) => (
                  <th key={k} className="px-2.5 py-1.5 font-bold text-text-secondary">{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border">
                  {head.map((_, k) => (
                    <td key={k} className={`px-2.5 py-1 ${k > 0 && /^[\d.,\s-]+$/.test(r[k] ?? "") ? "text-right tabular-nums" : ""}`}>{inline(r[k] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    text.push(lines[i]);
  }
  flushText();
  return <div className="flex flex-col gap-1.5">{blocks}</div>;
}
