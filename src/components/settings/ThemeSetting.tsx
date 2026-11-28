"use client";

import { setTheme, THEME_OPTIONS, useTheme } from "@/lib/displayPrefs";

/** Light / Dark / Auto, side by side; the chosen one is filled. Kept on this device, and every page changes at once. */
export function ThemeSetting() {
  const theme = useTheme();
  return (
    <div role="group" aria-label="Theme" className="inline-flex shrink-0 rounded-lg border border-border-strong bg-surface-alt p-0.5">
      {THEME_OPTIONS.map((t) => {
        const on = theme === t.value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={on}
            onClick={() => setTheme(t.value)}
            className={`min-h-9 rounded-md px-3 text-[13px] font-semibold ${on ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-text"}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
