import { MODULES, type ModuleKey } from "@/lib/constants";

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
  ["/reports", "reports"],
  ["/ai-assistant", "ai-assistant"],
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
export function canAccessPath(allowed: string[] | null | undefined, pathname: string): boolean {
  if (pathname === "/hr/overtime" || pathname.startsWith("/hr/overtime/")) {
    return canAccessModule(allowed, "hr") || canAccessModule(allowed, "overtime");
  }
  const key = moduleForPath(pathname);
  return key === null || canAccessModule(allowed, key);
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
  ...MODULES.map((m) => ({ key: m.key as string, label: m.label })),
  { key: "overtime", label: "HR – Overtime approvals only" },
];

export function firstAllowedHref(allowed: string[] | null | undefined): string {
  const first = MODULES.find((m) => canAccessModule(allowed, m.key));
  return first ? first.href : "/";
}
