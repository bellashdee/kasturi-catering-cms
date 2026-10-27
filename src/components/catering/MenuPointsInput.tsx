"use client";

import { useEffect, useRef, useState } from "react";
import { menuRows } from "@/lib/catering/days";

const rowClass =
  "h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";

/**
 * The menu of a day keyed in point by point: one box for each menu item (1. 2. 3. ...), Enter goes to the next item, a list pasted
 * from elsewhere (one item on each line) is split into the boxes. It is saved as one item on each line, the same as before, so
 * the quotation, the kitchen and the calendar read it exactly as they did.
 */
export function MenuPointsInput({ value, onChange, placeholder = "e.g. Nasi Minyak" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  // blank rows are kept while the person is typing (the value keeps them as empty lines) and removed when it is saved
  const rows = value === "" ? [""] : value.split("\n");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);

  useEffect(() => {
    if (focusRow === null) return;
    inputs.current[focusRow]?.focus();
    const reset = setTimeout(() => setFocusRow(null), 0);
    return () => clearTimeout(reset);
  }, [focusRow, rows.length]);

  const emit = (next: string[]) => onChange(next.length === 1 && next[0] === "" ? "" : next.join("\n"));
  const setRow = (i: number, text: string) => emit(rows.map((r, idx) => (idx === i ? text : r)));
  const addAfter = (i: number) => {
    emit([...rows.slice(0, i + 1), "", ...rows.slice(i + 1)]);
    setFocusRow(i + 1);
  };
  const remove = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    emit(next.length === 0 ? [""] : next);
    setFocusRow(Math.max(0, i - 1));
  };

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {rows.map((text, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-[13px] font-bold text-text-muted">{`${i + 1}.`}</span>
          <input
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={text}
            onChange={(e) => setRow(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (text.trim()) addAfter(i);
              } else if (e.key === "Backspace" && text === "" && rows.length > 1) {
                e.preventDefault();
                remove(i);
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (!/\r?\n/.test(pasted)) return;
              e.preventDefault();
              // a pasted list may start each line with "-", "•" or "1." : the box already numbers the items
              const items = menuRows(pasted).map((l) => l.replace(/^(?:[-–•*]|\d+[.)])\s+/, "")).filter(Boolean);
              if (items.length === 0) return;
              const next = [...rows.slice(0, i), ...(text.trim() ? [text] : []), ...items, ...rows.slice(i + 1)];
              emit(next);
              setFocusRow(next.length - 1);
            }}
            maxLength={150}
            placeholder={i === 0 ? placeholder : ""}
            className={rowClass}
            aria-label={`Menu item ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={rows.length === 1 && text === ""}
            aria-label={`Remove menu item ${i + 1}`}
            title="Remove"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-strong text-[18px] leading-none text-text-muted hover:border-danger hover:text-danger disabled:opacity-30"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3 pl-8">
        <button type="button" onClick={() => addAfter(rows.length - 1)} className="text-[12.5px] font-semibold text-primary">
          + Add menu item
        </button>
        <span className="text-[11.5px] text-text-muted">Press Enter for the next item.</span>
      </div>
    </div>
  );
}
