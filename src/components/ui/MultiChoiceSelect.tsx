"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * A choice box in which one or more options can be ticked: open the list, type to search, tick the ones you want. The chosen ones
 * are shown on the box (each can be taken off with its x), so the choice is visible without opening the list.
 */
export function MultiChoiceSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  searchPlaceholder = "Search",
  className = "",
}: {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
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

  // a value the record already has but the list no longer offers is still shown (and can be taken off)
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  const words = search.trim().toUpperCase().split(/\s+/).filter(Boolean);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setSearch("");
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSearch("");
            setOpen((o) => !o);
          }
        }}
        className="mt-1 flex min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border-strong bg-white px-2 py-1 text-left text-[13px] outline-none focus:border-primary"
      >
        <span className="flex flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="text-text-muted">{placeholder}</span>
          ) : (
            value.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 rounded-md bg-info-bg px-2 py-0.5 text-[12.5px] font-semibold text-primary">
                {v}
                <button
                  type="button"
                  aria-label={`Remove ${v}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                  className="text-text-muted hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </span>
        <span aria-hidden="true" className="shrink-0 text-text-muted">
          {open ? "▴" : "▾"}
        </span>
      </div>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface py-1 shadow-lg">
          <div className="sticky top-0 border-b border-border bg-surface px-2 pb-1.5 pt-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-md border border-border-strong px-2 text-[13px] outline-none focus:border-primary"
            />
          </div>
          {all
            .filter((o) => words.every((w) => `${o} ${t(o)}`.toUpperCase().includes(w)))
            .map((o) => {
              const on = value.includes(o);
              return (
                <label key={o} role="option" aria-selected={on} className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13.5px] font-semibold hover:bg-surface-alt ${on ? "text-primary" : "text-text"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(o)} className="accent-[var(--color-primary)]" />
                  {o}
                </label>
              );
            })}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full border-t border-border px-3 py-2 text-left text-[12.5px] font-semibold text-text-secondary hover:bg-surface-alt">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
