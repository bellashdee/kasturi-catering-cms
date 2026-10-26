"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

export type Choice = { value: string; label: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * A choice from a fixed list, searched by typing: click the box (or the arrow) to see the whole list, type to narrow it down, then pick one.
 * Unlike a free search box, only an option of the list is accepted: anything else that was typed is not a value, and the form refuses to be sent
 * until an option is chosen (when `required`). An option with the value "" (for example "None") is a valid choice too.
 */
export function ChoiceSelect({
  value,
  onChange,
  options: rawOptions,
  placeholder,
  className,
  required,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  // the options are shown (and searched) in the language of the page
  const { t } = useI18n();
  const options = useMemo(() => rawOptions.map((o) => ({ value: o.value, label: t(o.label) })), [rawOptions, t]);
  const selected = options.find((o) => o.value === value);
  // what is being typed (null: the box shows the chosen option, also when it is changed from outside)
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? selected?.label ?? "";
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exact = (t: string) => options.find((o) => norm(o.label) === norm(t));
  const valid = !!exact(text) && exact(text)?.value === value;
  // a required box with no real choice cannot be sent
  useEffect(() => {
    const message = t("Choose one option from the list.");
    inputRef.current?.setCustomValidity(required && !(valid && value !== "") ? message : !valid && text.trim() ? message : "");
  }, [required, valid, value, text, t]);

  const matches = useMemo(() => {
    const query = selected && norm(text) === norm(selected.label) ? "" : text;
    const words = norm(query).split(" ").filter(Boolean);
    return options.filter((o) => words.every((w) => norm(o.label).includes(w)));
  }, [options, selected, text]);
  const showList = open && !disabled && matches.length > 0;

  function pick(o: Choice) {
    setDraft(null);
    onChange(o.value);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={text}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          setOpen(true);
          setActive(-1);
          const hit = exact(t);
          if (hit) onChange(hit.value);
          else if (value !== "" || selected) onChange("");
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          closeTimer.current = setTimeout(() => {
            setOpen(false);
            // what is not an option of the list is not kept
            const hit = exact(text);
            if (hit && hit.value !== value) onChange(hit.value);
            setDraft(null);
          }, 150);
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
            e.preventDefault();
            const target = active >= 0 ? matches[active] : matches.length === 1 ? matches[0] : null;
            if (target) pick(target);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className={`${className ?? ""} pr-9 disabled:bg-surface-alt disabled:opacity-60`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Show the list"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
          inputRef.current?.focus();
        }}
        className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text disabled:opacity-40"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg">
          {matches.map((o, i) => (
            <li
              key={o.value || "__empty"}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-[13px] font-semibold text-text ${i === active ? "bg-info-bg" : ""} ${o.value === value ? "text-primary" : ""}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
