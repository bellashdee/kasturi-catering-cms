"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Company = { id: string; name: string };

/** The theme name of a company ("kasturi", "o2life", "signature"); null for anything else. */
export function themeOf(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("kasturi")) return "kasturi";
  if (n.includes("o2")) return "o2life";
  if (n.includes("signature")) return "signature";
  return null;
}

function themeMap(companies: Company[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of companies) {
    const t = themeOf(c.name);
    if (t) map[c.id] = t;
  }
  return map;
}

/**
 * The look follows the company being viewed (?company=...): Kasturi Indah, O2 Life and Signature Solution each have their own
 * colours; all companies together keep the default look. The small script sets it before the first paint, so the page never
 * flashes in the wrong colours; the effect keeps it right as the person moves between companies without a page load.
 */
export function CompanyTheme({ companies }: { companies: Company[] }) {
  const params = useSearchParams();
  const company = params.get("company");
  const map = themeMap(companies);
  const theme = company ? (map[company] ?? null) : null;

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  return null;
}

/** Runs before the page is painted (see CompanyTheme). */
export function CompanyThemeScript({ companies }: { companies: Company[] }) {
  const code = `(function(){try{var m=${JSON.stringify(themeMap(companies))};var t=m[new URLSearchParams(location.search).get("company")];if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
