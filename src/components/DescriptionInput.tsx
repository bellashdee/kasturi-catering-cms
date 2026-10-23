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
const MAX_SHOWN = 80;

/**
 * A Description box with a drop-down list (A to Z) of the items and descriptions already in the system. Click the arrow or the box
 * to see the list, type to narrow it down, pick one to fill the box. Typing something that is not in the list is always allowed.
 */
export function DescriptionInput({
  value,
  onChange,
  companyId = null,
  className = "",
  placeholder,
  required,
  disabled,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  companyId?: string | null;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  const [options, setOptions] = useState<DescriptionOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const words = norm(value).split(" ").filter(Boolean);
    const hits = words.length === 0 ? options : options.filter((o) => words.every((w) => norm(o.text).includes(w)) && norm(o.text) !== norm(value));
    return hits.slice(0, MAX_SHOWN);
  }, [options, value]);
  const showList = open && matches.length > 0;

  function pick(o: DescriptionOption) {
    onChange(o.text);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          closeTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            setOpen(true);
            return;
          }
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active] ?? matches[0]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show the list"
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg">
          {matches.map((o, i) => (
            <li
              key={o.text}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
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
