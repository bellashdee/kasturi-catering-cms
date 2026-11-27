"use client";

import { useState } from "react";

/**
 * A time box in 12-hour form (hour · minute · AM/PM), whatever the computer's own clock setting is.
 * The value in and out stays "HH:MM" (24-hour), as the forms save it; "" means no time.
 */
export function TimeInput12({
  value,
  onChange,
  required,
  fieldClass,
  className = "",
  ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  required?: boolean;
  fieldClass: string;
  className?: string;
  ariaLabel?: string;
}) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  const h24 = m ? Number(m[1]) : null;
  // minute / AM-PM picked before the hour are kept here until the hour is picked
  const [draft, setDraft] = useState<{ min: string; p: string }>({ min: "", p: "" });
  const hour = h24 === null ? "" : String(h24 % 12 || 12);
  const minute = m ? m[2] : draft.min;
  const period = h24 === null ? draft.p : h24 < 12 ? "AM" : "PM";

  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
  if (minute && !minutes.includes(minute)) minutes.push(minute), minutes.sort();

  const emit = (h: string, min: string, p: string) => {
    if (!h) {
      setDraft({ min, p });
      if (value) onChange("");
      return;
    }
    const n = Number(h) % 12;
    // a catering time with no AM/PM chosen yet: 7 to 11 is the morning, the rest the afternoon / evening
    const pp = p || (Number(h) >= 7 && Number(h) <= 11 ? "AM" : "PM");
    const hh = pp === "PM" ? n + 12 : n;
    onChange(`${String(hh).padStart(2, "0")}:${min || "00"}`);
  };

  const base = fieldClass.split(/\s+/).filter((c) => !/^(mt-|w-|px-)/.test(c)).join(" ");
  const sel = `${base} min-w-0 flex-1 px-1.5 text-center`;
  return (
    <div className={`mt-1.5 flex min-w-0 items-center gap-1 ${className}`} role="group" aria-label={ariaLabel}>
      <select required={required} value={hour} onChange={(e) => emit(e.target.value, minute, period)} className={sel} aria-label="Hour">
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-text-muted">:</span>
      <select value={minute} onChange={(e) => emit(hour, e.target.value, period)} className={sel} aria-label="Minute">
        {!minute && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <select value={period} onChange={(e) => emit(hour, minute, e.target.value)} className={sel} aria-label="AM or PM">
        {!period && <option value="">AM/PM</option>}
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      {(value || draft.min || draft.p) && !required && (
        <button type="button" onClick={() => {
            setDraft({ min: "", p: "" });
            onChange("");
          }} className="px-1 text-[12px] font-semibold text-text-muted hover:text-danger" aria-label="Clear time">
          ✕
        </button>
      )}
    </div>
  );
}
