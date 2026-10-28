"use client";

import { useSyncExternalStore } from "react";

export const TEXT_SIZE_KEY = "cms-text-size";
export const EASY_FONT_KEY = "cms-easy-font";

const SIZES = [
  { value: "normal", label: "Normal", sample: "text-[14px]" },
  { value: "large", label: "Large", sample: "text-[17px]" },
  { value: "xlarge", label: "Extra large", sample: "text-[20px]" },
] as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* the choice still applies to this page */
  }
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const changed = () => listeners.forEach((fn) => fn());

/** The text size and the easy-to-read font of every page, kept on this device (the pages read it before they are shown). */
export function DisplaySettings() {
  // read from this device after the page is shown (the server shows the normal choice first)
  const size = useSyncExternalStore(
    subscribe,
    () => {
      const saved = read(TEXT_SIZE_KEY);
      return saved === "large" || saved === "xlarge" ? saved : "normal";
    },
    () => "normal",
  );
  const easy = useSyncExternalStore(subscribe, () => read(EASY_FONT_KEY) === "on", () => false);

  function chooseSize(value: string) {
    write(TEXT_SIZE_KEY, value);
    if (value === "normal") document.documentElement.removeAttribute("data-text-size");
    else document.documentElement.setAttribute("data-text-size", value);
    changed();
  }

  function chooseEasy(on: boolean) {
    write(EASY_FONT_KEY, on ? "on" : "off");
    if (on) document.documentElement.setAttribute("data-easy-font", "on");
    else document.documentElement.removeAttribute("data-easy-font");
    changed();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[13px] font-bold text-text">Text size</div>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">Makes everything on every page bigger: the words, the buttons and the boxes.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => chooseSize(s.value)}
              aria-pressed={size === s.value}
              className={`rounded-xl border-2 px-5 py-3 font-bold ${s.sample} ${size === s.value ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[13px] font-bold text-text">Easy-to-read letters</div>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">Uses letters that are made to be clear for people who find small or similar letters hard to read.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => chooseEasy(false)}
            aria-pressed={!easy}
            className={`rounded-xl border-2 px-5 py-3 text-[15px] font-bold ${!easy ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
          >
            Normal letters
          </button>
          <button
            type="button"
            onClick={() => chooseEasy(true)}
            aria-pressed={easy}
            className={`rounded-xl border-2 px-5 py-3 text-[15px] font-bold ${easy ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
          >
            Easy-to-read letters
          </button>
        </div>
      </div>
      <p className="text-[12px] text-text-muted">This is kept on this computer or phone. Choose it again on another device.</p>
    </div>
  );
}
