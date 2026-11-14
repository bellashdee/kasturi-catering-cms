"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useTouchScreen } from "@/lib/useTouchScreen";

export type Choice = { value: string; label: string };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * A choice from a fixed list, searched by typing: click the box (or the arrow) to see the whole list, type to narrow it down, then pick one.
 * Unlike a free search box, only an option of the list is accepted: anything else that was typed is not a value, and the form refuses to be sent
 * until an option is chosen (when `required`). An option with the value "" (for example "None") is a valid choice too. The list opens above everything
 * else on the page, so a table or a card never cuts it off.
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
  name,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  /** when the box is in a form that is sent as it is (a GET form), the chosen value is sent under this name */
  name?: string;
  ariaLabel?: string;
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
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // on a phone the list opens as a big list from the bottom of the screen (rows easy to tap, no keyboard unless searching)
  const touch = useTouchScreen();
  const [sheet, setSheet] = useState(false);
  const [sheetSearch, setSheetSearch] = useState("");
  function openSheet() {
    if (disabled) return;
    setSheetSearch("");
    setSheet(true);
  }

  const exact = (s: string) => options.find((o) => norm(o.label) === norm(s));
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

  // where the list is drawn: under the box (above it when there is no room below), in fixed coordinates
  useLayoutEffect(() => {
    if (!showList) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 160 && above > below;
      const maxHeight = Math.max(120, Math.min(256, up ? above : below));
      setBox({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, maxHeight, above: up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showList, matches.length]);

  function pick(o: Choice) {
    setDraft(null);
    onChange(o.value);
    setOpen(false);
    setActive(-1);
    setSheet(false);
  }

  const sheetWords = norm(sheetSearch).split(" ").filter(Boolean);
  const sheetMatches = options.filter((o) => sheetWords.every((w) => norm(o.label).includes(w)));

  return (
    <div className={`relative ${className?.includes("w-full") ? "block w-full" : "inline-block"}`}>
      <input
        ref={inputRef}
        id={id}
        value={text}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          const s = e.target.value;
          setDraft(s);
          setOpen(true);
          setActive(-1);
          const hit = exact(s);
          if (hit) onChange(hit.value);
          else if (value !== "" || selected) onChange("");
        }}
        onFocus={(e) => {
          if (touch) {
            e.currentTarget.blur();
            openSheet();
            return;
          }
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
        inputMode={touch ? "none" : undefined}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className={`${className ?? ""} pr-9 disabled:bg-surface-alt disabled:opacity-60`}
      />
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Show the list"
        onMouseDown={(e) => {
          e.preventDefault();
          if (touch) return openSheet();
          setOpen((o) => !o);
          inputRef.current?.focus();
        }}
        className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text disabled:opacity-40"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {touch &&
        sheet &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/40" onClick={() => setSheet(false)}>
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <input
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  placeholder={t("Search")}
                  aria-label={t("Search")}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-border-strong px-3 text-[16px] outline-none focus:border-primary"
                />
                <button type="button" onClick={() => setSheet(false)} className="h-11 shrink-0 rounded-lg px-3 text-[15px] font-semibold text-text-secondary">
                  {t("Close")}
                </button>
              </div>
              <ul role="listbox" className="overflow-y-auto overscroll-contain py-1">
                {sheetMatches.length === 0 ? (
                  <li className="px-4 py-4 text-[15px] text-text-muted">{t("No match.")}</li>
                ) : (
                  sheetMatches.map((o) => (
                    <li key={o.value || "__empty"} role="option" aria-selected={o.value === value}>
                      <button
                        type="button"
                        onClick={() => pick(o)}
                        className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left text-[15px] font-semibold active:bg-surface-alt ${o.value === value ? "bg-info-bg text-primary" : "text-text"}`}
                      >
                        <span>{o.label}</span>
                        {o.value === value && <span aria-hidden="true">✓</span>}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>,
          document.body,
        )}
      {!touch &&
        showList &&
        box &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            style={{ position: "fixed", left: box.left, top: box.above ? undefined : box.top, bottom: box.above ? window.innerHeight - box.top : undefined, width: box.width, maxHeight: box.maxHeight }}
            className="z-[70] overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg"
          >
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
          </ul>,
          document.body,
        )}
    </div>
  );
}
