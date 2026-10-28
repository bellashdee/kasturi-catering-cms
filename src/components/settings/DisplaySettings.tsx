"use client";

import { BASE_FONT_SIZE, FONT_OPTIONS, MAX_FONT_SIZE, MIN_FONT_SIZE, setFont, setFontSize, useFont, useFontSize, type FontChoice } from "@/lib/displayPrefs";

/** The font and the text size (10 to 25) of every page, kept on this device (the pages read it before they are shown). */
export function DisplaySettings() {
  const font = useFont();
  const size = useFontSize();
  const family = FONT_OPTIONS.find((f) => f.value === font)?.family;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="display-font" className="text-[13px] font-bold text-text">Font</label>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">Choose the letters you find easiest to read. Every page changes.</p>
        <select
          id="display-font"
          value={font}
          onChange={(e) => setFont(e.target.value as FontChoice)}
          className="mt-3 h-11 w-full max-w-sm rounded-lg border border-border-strong bg-surface px-3 text-[15px] outline-none focus:border-primary"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="display-size" className="text-[13px] font-bold text-text">Font size (10 to 25)</label>
        <p className="mt-0.5 text-[12.5px] text-text-secondary">Makes everything on every page bigger or smaller: the words, the buttons and the boxes. {`${BASE_FONT_SIZE} is the usual size.`}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <input
            id="display-size"
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={size}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="h-2 w-64 max-w-full cursor-pointer accent-[var(--color-primary)]"
          />
          <input
            type="number"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={size}
            onChange={(e) => setFontSize(Number(e.target.value))}
            aria-label="Font size"
            className="h-11 w-20 rounded-lg border border-border-strong bg-surface px-3 text-center text-[15px] font-bold outline-none focus:border-primary"
          />
          <button type="button" onClick={() => setFontSize(BASE_FONT_SIZE)} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface-alt">
            Usual size
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-alt p-4" style={{ fontFamily: family }}>
        <div className="text-[12px] font-semibold text-text-muted">Sample</div>
        <p className="mt-1 text-[15px] text-text">The quick brown fox jumps over the lazy dog. 0123456789</p>
      </div>

      <p className="text-[12px] text-text-muted">This is kept on this computer or phone. Choose it again on another device.</p>
    </div>
  );
}
