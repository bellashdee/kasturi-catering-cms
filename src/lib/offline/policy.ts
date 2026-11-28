/**
 * Which pages are kept on the device for offline viewing (the last copy the person opened, kept only for that person and removed at
 * sign-out). This list is mirrored in public/sw.js (OFFLINE_PAGES / NEVER_OFFLINE): scripts/check-offline-policy.mjs checks they match.
 *
 * Kept: day-to-day operation pages. Never kept: payroll, staff files (IC, bank, salary), finance, reports, admin and settings, the AI
 * assistant, attendance (location) and imports. See docs/offline-first-plan.md.
 */
export const OFFLINE_PAGES = [
  "/bulletin",
  "/birthdays",
  "/priority-centre",
  "/catering",
  "/kitchen",
  "/driver-logistics",
  "/restaurant",
  "/marketing",
  "/spending/petty-cash",
  "/spending/my-claims",
  "/supplier-procurement",
];

/** Parts of the kept modules that are still never kept (personal data, cash figures, location, imports). */
export const NEVER_OFFLINE = [
  "/catering/customers",
  "/catering/import",
  "/driver-logistics/attendance",
  "/driver-logistics/vehicles/import",
  "/kitchen/ingredients/import",
  "/marketing/expenses",
  "/marketing/leads/import",
  "/restaurant/cash",
  "/restaurant/import",
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The home page is kept too (the app opens on it). */
export function isOfflinePage(pathname: string): boolean {
  if (pathname === "/") return true;
  if (NEVER_OFFLINE.some((p) => under(pathname, p))) return false;
  return OFFLINE_PAGES.some((p) => under(pathname, p));
}
