import { MODULES, type ModuleKey } from "@/lib/constants";
import { canOpenSection, sectionForPath } from "@/lib/sections";

/** Which module a page belongs to, by URL prefix. Pages not listed here (dashboard, settings, login) are not module-restricted. */
const PATH_MODULE: [string, ModuleKey][] = [
  ["/hr", "hr"],
  ["/marketing", "marketing"],
  ["/catering", "catering"],
  ["/driver-logistics", "driver-logistics"],
  ["/kitchen", "kitchen"],
  ["/supplier-procurement", "supplier-procurement"],
  ["/admin", "finance-admin"],
  ["/finance", "finance-admin"],
  // Company Spending: expenses and budgets are Admin & Finance; the petty cash pages are open to its holders (the database decides who sees what)
  ["/spending/expenses", "finance-admin"],
  ["/spending/budgets", "finance-admin"],
  ["/reports", "reports"],
  ["/restaurant", "restaurant"],
];

export function moduleForPath(pathname: string): ModuleKey | null {
  for (const [prefix, key] of PATH_MODULE) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  return null;
}

/**
 * Whether the user may open this page. The OT pages (/hr/overtime) are open to members with the full HR module
 * or with the separate "overtime" permission; every other page follows its module.
 */
export function canAccessPath(allowed: string[] | null | undefined, pathname: string, sections?: string[] | null): boolean {
  if (pathname === "/hr/overtime" || pathname.startsWith("/hr/overtime/")) {
    if (!(canAccessModule(allowed, "hr") || canAccessModule(allowed, "overtime"))) return false;
    // the separate overtime permission (approvers) is not a part of the HR sub-categories
    if (!canAccessModule(allowed, "hr")) return true;
    const overtimeSection = sectionForPath(pathname);
    return !overtimeSection || canOpenSection(sections, overtimeSection.key);
  }
  const key = moduleForPath(pathname);
  if (key !== null && !canAccessModule(allowed, key)) return false;
  // a member limited to some sections of a module cannot open the other sections of it, whatever address is typed
  const section = sectionForPath(pathname);
  return !section || canOpenSection(sections, section.key);
}

/** allowed = null means every module. */
export function canAccessModule(allowed: string[] | null | undefined, key: ModuleKey): boolean {
  return !allowed || allowed.includes(key);
}

/** Combines the grants of a user: any unrestricted grant (null) means every module, otherwise the union. */
export function mergeAllowedModules(grants: (string[] | null)[]): string[] | null {
  if (grants.length === 0 || grants.some((g) => g === null)) return null;
  return Array.from(new Set(grants.flat() as string[]));
}

/** The modules that can be switched on or off for a member (Settings is always Super Admin only). */
export const ASSIGNABLE_MODULES: { key: string; label: string }[] = [
  ...MODULES.filter((m) => m.key !== "marketing" && m.key !== "ai-assistant").map((m) => ({ key: m.key as string, label: m.label })),
  { key: "overtime", label: "HR – Overtime approvals only" },
];

export function firstAllowedHref(allowed: string[] | null | undefined): string {
  const first = MODULES.find((m) => canAccessModule(allowed, m.key));
  return first ? first.href : "/";
}
