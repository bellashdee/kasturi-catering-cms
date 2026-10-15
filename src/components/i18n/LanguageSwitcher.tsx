"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/I18nProvider";

/** The language menu: every language is written in its own language, and picking one applies at once (no page reload). */
export function LanguageSwitcher({ align = "right" }: { align?: "left" | "right" }) {
  const { lang, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 text-[14px] font-semibold text-text hover:bg-bg"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
        </svg>
        <span className="hidden md:inline" translate="no">{current.native}</span>
        <span className="md:hidden" translate="no">{current.short}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Language"
          className={`absolute top-12 z-50 w-56 overflow-hidden rounded-xl border border-border-strong bg-surface py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang}>
              <button
                type="button"
                lang={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] hover:bg-bg ${l.code === lang ? "font-bold text-primary" : "font-medium text-text"}`}
              >
                <span translate="no">{l.native}</span>
                {l.code === lang && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
