"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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

/*
 * The company chosen last in this tab. A list page carries the company in its address (?company=...), but the page of one record opened
 * from it (an event, a staff member, a request: an address with the record's id in it) usually does not; that page keeps the colour and
 * the name of the company chosen last, so the hint does not disappear. Any other page without ?company is all companies (the default look).
 */
const KEY = "cms-viewed-company";
const RECORD_SOURCE = String.raw`\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)(\/|$)`;
const RECORD = new RegExp(RECORD_SOURCE, "i");

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
function readStored(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null) {
  try {
    if (readStored() === id) return;
    if (id) sessionStorage.setItem(KEY, id);
    else sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

/** The company whose colour and name the page shows: ?company=..., or on a record page the company chosen last; null = all companies. */
export function useViewedCompanyId(): string | null {
  const company = useSearchParams().get("company");
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  if (company) return company;
  return RECORD.test(pathname) ? stored : null;
}

/**
 * The look follows the company being viewed: Kasturi Indah (green), O2 Life (red) and Signature Solution (blue) each have their own
 * colours; all companies together keep the default look. The small script sets it before the first paint, so the page never
 * flashes in the wrong colours; the effect keeps it right as the person moves between companies without a page load.
 */
export function CompanyTheme({ companies }: { companies: Company[] }) {
  const company = useSearchParams().get("company");
  const pathname = usePathname();
  const viewed = useViewedCompanyId();
  const map = themeMap(companies);
  const theme = viewed ? (map[viewed] ?? null) : null;

  // remember the company chosen (or forget it on a page of all companies)
  useEffect(() => {
    if (company) writeStored(company);
    else if (!RECORD.test(pathname)) writeStored(null);
  }, [company, pathname]);

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
  const code = `(function(){try{var m=${JSON.stringify(themeMap(companies))},k=${JSON.stringify(KEY)},c=new URLSearchParams(location.search).get("company"),s=null;try{s=sessionStorage.getItem(k)}catch(e){}if(!c&&new RegExp(${JSON.stringify(RECORD_SOURCE)},"i").test(location.pathname))c=s;var t=c&&m[c];if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
  // the browser runs it from the server HTML before the first paint; on the client React renders it as plain text (type text/plain),
  // so React does not warn about a script tag and nothing runs twice (the way the Next.js guide "Preventing Flash" does it)
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: code }} />;
}
