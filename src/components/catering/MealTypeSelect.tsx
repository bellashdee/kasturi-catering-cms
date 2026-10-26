"use client";

import { useEffect, useRef, useState } from "react";
import { MEAL_TYPE_LABEL, mealTypeOptions } from "@/lib/catering/constants";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Meal type as a dropdown: open the list, tick one or more meal types. The chosen ones are shown on the button, so the choice is
 * visible without opening the list. The list is in alphabetical order.
 */
export function MealTypeSelect({ value, onToggle }: { value: string[]; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1.5">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setSearch("");
          setOpen((o) => !o);
        }}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-left text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        <span className="flex flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="text-text-muted">Select meal type</span>
          ) : (
            value.map((k) => (
              <span key={k} className="rounded-md bg-info-bg px-2 py-0.5 text-[12.5px] font-semibold text-primary">
                {MEAL_TYPE_LABEL[k] ?? k}
              </span>
            ))
          )}
        </span>
        <span aria-hidden="true" className="text-text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface py-1 shadow-lg">
          {/* type to search the meal types, then tick the ones you want */}
          <div className="sticky top-0 border-b border-border bg-surface px-2 pb-1.5 pt-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meal type"
              aria-label="Search meal type"
              className="h-8 w-full rounded-md border border-border-strong px-2 text-[13px] outline-none focus:border-primary"
            />
          </div>
          {mealTypeOptions(value)
            .filter(([, label]) => search.trim().toUpperCase().split(/\s+/).every((w) => `${label} ${t(label)}`.toUpperCase().includes(w)))
            .map(([key, label]) => {
              const on = value.includes(key);
              return (
                <label key={key} role="option" aria-selected={on} className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold hover:bg-surface-alt ${on ? "text-primary" : "text-text"}`}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(key)} className="accent-[var(--color-primary)]" />
                  {label}
                </label>
              );
            })}
        </div>
      )}
    </div>
  );
}
