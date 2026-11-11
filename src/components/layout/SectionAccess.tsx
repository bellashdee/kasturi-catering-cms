"use client";

import { createContext, useCallback, useContext } from "react";
import { tabVisible } from "@/lib/sections";

const SectionAccessContext = createContext<string[] | null>(null);

/** Tells the menus which sub-categories (tabs) of a module the signed-in member may open; null = no limit. */
export function SectionAccessProvider({ allowedSections, children }: { allowedSections: string[] | null; children: React.ReactNode }) {
  return <SectionAccessContext.Provider value={allowedSections}>{children}</SectionAccessContext.Provider>;
}

export const useAllowedSections = () => useContext(SectionAccessContext);

/** `visible(href)` is false for a tab the member does not have. */
export function useTabVisible() {
  const sections = useContext(SectionAccessContext);
  return useCallback((href: string) => tabVisible(sections, href), [sections]);
}
