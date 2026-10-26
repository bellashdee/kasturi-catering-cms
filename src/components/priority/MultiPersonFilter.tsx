"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD } from "@/components/priority/ui";

type Option = { value: string; label: string };

/**
 * A filter box in which one or several people can be ticked. The ticked values are sent as one field, separated by commas
 * (nothing ticked means everyone). Used for the Responsible person of the To-Do Checklist.
 */
export function MultiPersonFilter({ id, name, options, initial }: { id: string; name: string; options: Option[]; initial: string[] }) {
  const [chosen, setChosen] = useState<string[]>(initial.filter((v) => options.some((o) => o.value === v)));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (value: string) => setChosen((c) => (c.includes(value) ? c.filter((v) => v !== value) : [...c, value]));
  const labels = chosen.map((v) => options.find((o) => o.value === v)?.label ?? v);
  const summary = chosen.length === 0 ? "Everyone" : chosen.length <= 2 ? labels.join(", ") : `${labels[0]} +${chosen.length - 1}`;

  return (
    <div ref={box} className="relative">
      <input type="hidden" name={name} value={chosen.join(",")} />
      <button type="button" id={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${FIELD} flex items-center justify-between gap-2 text-left`}>
        <span className="truncate">{summary}</span>
        <span aria-hidden="true" className="text-[11px] text-text-muted">▾</span>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 top-full z-30 mt-1 max-h-72 min-w-full overflow-y-auto rounded-lg border border-border-strong bg-surface p-1.5 shadow-lg">
          <button type="button" onClick={() => setChosen([])} className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold text-primary hover:bg-surface-alt">
            Everyone (clear)
          </button>
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] text-text hover:bg-surface-alt">
              <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4" />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
