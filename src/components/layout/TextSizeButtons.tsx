"use client";

import { setFontSize, useFontSize } from "@/lib/displayPrefs";

const OPTIONS = [
  { size: 14, title: "Usual text size", className: "text-[13px]" },
  { size: 18, title: "Large text", className: "text-[17px]" },
  { size: 22, title: "Extra large text", className: "text-[21px]" },
];

/** Three buttons on every page to make all the text bigger or smaller (kept on this device; the exact size 10 to 25 is chosen in Settings). */
export function TextSizeButtons() {
  const size = useFontSize();
  return (
    <div role="group" aria-label="Text size" className="flex items-center overflow-hidden rounded-lg border border-border-strong bg-surface">
      {OPTIONS.map((o) => (
        <button
          key={o.size}
          type="button"
          title={o.title}
          aria-label={o.title}
          aria-pressed={size === o.size}
          onClick={() => setFontSize(o.size)}
          className={`flex h-9 w-9 items-center justify-center font-extrabold leading-none ${o.className} ${size === o.size ? "bg-primary text-white" : "text-text hover:bg-surface-alt"}`}
        >
          A
        </button>
      ))}
    </div>
  );
}
