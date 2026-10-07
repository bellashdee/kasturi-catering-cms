import { MODULES, type ModuleKey } from "@/lib/constants";

/** Which module a page belongs to, by URL prefix. Pages not listed here (dashboard, settings, login) are not module-restricted. */
const PATH_MODULE: [string, ModuleKey][] = [
  ["/hr", "hr"],
  ["/marketing", "marketing"],
  ["/catering", "catering"],
  ["/driver-logistics", "driver-logistics"],
  ["/kitchen", "kitchen"],
  ["/ingredient-calculator", "kitchen"],
  ["/supplier-procurement", "supplier-procurement"],
  ["/admin", "finance-admin"],
  ["/finance", "finance-admin"],
  ["/reports", "reports"],
  ["/ai-assistant", "ai-assistant"],
];

export function moduleForPath(pathname: string): ModuleKey | null {
  for (const [prefix, key] of PATH_MODULE) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  return null;
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
export const ASSIGNABLE_MODULES = MODULES.map((m) => ({ key: m.key, label: m.label }));

export function firstAllowedHref(allowed: string[] | null | undefined): string {
  const first = MODULES.find((m) => canAccessModule(allowed, m.key));
  return first ? first.href : "/";
}
