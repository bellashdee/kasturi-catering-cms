"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "cms-zoom-hint-dismissed";

/**
 * A phone whose browser shows the page zoomed out ("Desktop site" ticked, or the browser's page zoom below 100%) lays the page out as wide
 * as a computer screen and shrinks it, so every word and button is tiny. The page cannot undo the browser's own setting, so it says how to.
 * Shown only on a touch screen whose own width is a phone's while the page is laid out much wider; it can be closed.
 */
export function ZoomedOutHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      let dismissed = false;
      try {
        dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        /* still check */
      }
      const touch = window.matchMedia("(pointer: coarse)").matches;
      const phone = Math.min(window.screen.width, window.screen.height) <= 520;
      setShow(!dismissed && touch && phone && window.innerWidth > Math.min(window.screen.width, window.screen.height) * 1.4);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!show) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[15px] text-text print:hidden">
      <span className="min-w-0 flex-1">
        <b className="block">This page is shown zoomed out, so it is small and hard to tap.</b>
        In the browser menu (⋮), untick &quot;Desktop site&quot;, and set the browser&apos;s page zoom / text size back to 100%.
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* closes for this page */
          }
          setShow(false);
        }}
        className="shrink-0 rounded-lg border border-border-strong bg-surface px-3 py-2 text-[14px] font-semibold"
      >
        Close
      </button>
    </div>
  );
}
