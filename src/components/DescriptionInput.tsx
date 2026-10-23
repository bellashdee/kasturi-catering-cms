"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { listDescriptionOptions, type DescriptionOption } from "@/lib/descriptions/actions";

const cache = new Map<string, Promise<DescriptionOption[]>>();

function loadOptions(companyId: string | null) {
  const key = companyId ?? "all";
  let p = cache.get(key);
  if (!p) {
    p = listDescriptionOptions(companyId).catch(() => []);
    cache.set(key, p);
  }
  return p;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const MAX_SHOWN = 80;
const SEPARATOR = ", ";

/**
 * A Description box where many items can be picked. Click the box or the arrow to see the list (A to Z), type to search first,
 * pick an item to add it (it stays open so the next one can be picked). Something that is not in the list can be added too:
 * type it and press Enter or comma. The chosen items are kept as one text, separated by commas. Nothing has to be filled in.
 */
export function DescriptionInput({
  value,
  onChange,
  companyId = null,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  companyId?: string | null;
  /** kept so the box can be dropped in where a plain input was; the box has its own look */
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  const [options, setOptions] = useState<DescriptionOption[]>([]);
  // the chosen items are read from the text itself, so a form that clears it or fills it from a document needs nothing more
  const chips = useMemo(() => splitValue(value), [value]);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    void loadOptions(companyId).then((o) => {
      if (alive) setOptions(o);
    });
    return () => {
      alive = false;
    };
  }, [companyId]);

  const matches = useMemo(() => {
    const words = norm(typed).split(" ").filter(Boolean);
    const taken = new Set(chips.map(norm));
    return options.filter((o) => !taken.has(norm(o.text)) && words.every((w) => norm(o.text).includes(w))).slice(0, MAX_SHOWN);
  }, [options, typed, chips]);
  const showList = open && matches.length > 0;

  function commit(next: string[]) {
    onChange(next.join(SEPARATOR));
  }

  function add(text: string) {
    const t = clean(text);
    if (!t) return;
    if (!chips.some((c) => norm(c) === norm(t))) commit([...chips, t]);
    setTyped("");
    setActive(0);
  }

  function remove(index: number) {
    commit(chips.filter((_, i) => i !== index));
  }

  return (
    <div className="relative">
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
        className={`flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border bg-white py-1 pl-2 pr-9 text-[13px] ${disabled ? "opacity-60" : ""} ${open ? "border-primary" : "border-border-strong"}`}
      >
        {chips.map((c, i) => (
          <span key={`${c}-${i}`} className="flex items-center gap-1 rounded-md bg-info-bg px-2 py-0.5 text-[12.5px] font-semibold text-text">
            {c}
            {!disabled && (
              <button type="button" tabIndex={-1} aria-label="Remove" onMouseDown={(e) => { e.preventDefault(); remove(i); }} className="text-text-muted hover:text-danger">
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={typed}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) {
              add(v.slice(0, -1));
              return;
            }
            setTyped(v);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            // the text that was typed is kept as an item, not lost
            closeTimer.current = setTimeout(() => {
              setOpen(false);
              setTyped((t) => {
                if (clean(t)) add(t);
                return "";
              });
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !typed && chips.length > 0) {
              remove(chips.length - 1);
              return;
            }
            if (e.key === "ArrowDown" && !open) {
              setOpen(true);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (!clean(typed)) return;
              add(showList ? matches[active]?.text ?? typed : typed);
              return;
            }
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={chips.length === 0 ? placeholder : undefined}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-[13px] outline-none"
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show the list"
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showList && (
        <ul id={listId} role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg">
          {matches.map((o, i) => (
            <li
              key={o.text}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o.text);
                inputRef.current?.focus();
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${i === active ? "bg-info-bg" : ""}`}
            >
              <span className="text-[13px] font-semibold text-text">{o.text}</span>
              <span className="shrink-0 text-[11px] text-text-muted">{o.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "A, B" back into the items it was made of (a text written by hand or read from a document is split at the commas). */
function splitValue(value: string): string[] {
  return value
    .split(/\s*,\s*/)
    .map(clean)
    .filter(Boolean);
}
