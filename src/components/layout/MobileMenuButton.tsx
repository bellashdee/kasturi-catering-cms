"use client";

import { useMobileNav } from "./MobileNavContext";

export function MobileMenuButton() {
  const { open, setOpen } = useMobileNav();

  return (
    <button
      type="button"
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={() => setOpen(!open)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong text-text md:hidden"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="3" y1="5.5" x2="17" y2="5.5" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="14.5" x2="17" y2="14.5" />
      </svg>
    </button>
  );
}
