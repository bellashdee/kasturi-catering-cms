"use client";

import { useSyncExternalStore } from "react";

export const FONT_KEY = "cms-font";
export const FONT_SIZE_KEY = "cms-font-size";

/** The fonts a person can choose (the pages read the choice before they are shown). */
export const FONT_OPTIONS = [
  { value: "arial", label: "Arial", family: "Arial, Helvetica, sans-serif" },
  { value: "calibri", label: "Calibri", family: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  { value: "aptos", label: "Aptos", family: "Aptos, 'Segoe UI Variable', 'Segoe UI', Calibri, sans-serif" },
  { value: "verdana", label: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { value: "times", label: "Times New Roman", family: "'Times New Roman', Times, serif" },
  { value: "tahoma", label: "Tahoma", family: "Tahoma, Geneva, Verdana, sans-serif" },
  { value: "standard", label: "Standard (the system's own letters)", family: "var(--font-manrope), system-ui, sans-serif" },
] as const;

export type FontChoice = (typeof FONT_OPTIONS)[number]["value"];

export const DEFAULT_FONT: FontChoice = "arial";
export const BASE_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 25;

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

export function useFont(): FontChoice {
  return useSyncExternalStore(
    subscribe,
    () => {
      const saved = read(FONT_KEY);
      return FONT_OPTIONS.some((f) => f.value === saved) ? (saved as FontChoice) : DEFAULT_FONT;
    },
    () => DEFAULT_FONT,
  );
}

/** The text size, 10 to 25 (14 is the size the pages were made for). */
export function useFontSize(): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      const n = parseInt(read(FONT_SIZE_KEY) ?? "", 10);
      return n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE ? n : BASE_FONT_SIZE;
    },
    () => BASE_FONT_SIZE,
  );
}

export function setFont(value: FontChoice) {
  write(FONT_KEY, value);
  if (value === "standard") document.documentElement.removeAttribute("data-font");
  else document.documentElement.setAttribute("data-font", value);
  changed();
}

export function setFontSize(value: number) {
  const size = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value) || BASE_FONT_SIZE));
  write(FONT_SIZE_KEY, String(size));
  const root = document.documentElement;
  if (size === BASE_FONT_SIZE) {
    root.removeAttribute("data-font-size");
    root.style.removeProperty("--ui-zoom");
  } else {
    root.setAttribute("data-font-size", String(size));
    root.style.setProperty("--ui-zoom", String(size / BASE_FONT_SIZE));
  }
  changed();
}
