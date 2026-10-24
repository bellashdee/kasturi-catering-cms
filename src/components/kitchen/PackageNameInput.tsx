"use client";

import { useId, useMemo, useRef, useState } from "react";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const MAX_SHOWN = 80;

/**
 * The Package Name box: click it or the arrow to see the package names that already exist (A to Z), type to search first, pick one
 * to fill the box. A name that is not in the list can be typed as it is (it is a new package).
 */
export function PackageNameInput({
  value,
  onChange,
  names,
  placeholder,
  className,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  /** the package names that already exist */
  names: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = useMemo(() => Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)), [names]);
  const matches = useMemo(() => {
    const words = norm(value).split(" ").filter(Boolean);
    return sorted.filter((n) => words.every((w) => norm(n).includes(w))).slice(0, MAX_SHOWN);
  }, [sorted, value]);
  const showList = open && matches.length > 0;

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <input
        required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          closeTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp" && showList) {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && showList) {
            // Enter picks the highlighted name; with nothing highlighted it keeps what was typed
            e.preventDefault();
            if (active >= 0 && matches[active]) pick(matches[active]);
            else setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className={`${className ?? ""} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show the list"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="absolute bottom-1.5 right-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg">
          {matches.map((n, i) => (
            <li
              key={n}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-[13px] font-semibold text-text ${i === active ? "bg-info-bg" : ""}`}
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
