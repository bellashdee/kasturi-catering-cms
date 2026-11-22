/**
 * O2 Life Sdn Bhd is the company registered for the restaurant Restoran Bara Ikan Bakar Senibong: it sells meals over the counter, it has no
 * catering events, no customer invoices and no event P&L. While O2 Life is the ONLY company being viewed (chosen in the side bar, or the only one
 * the person may see), the pages made for catering are hidden and a direct address to one of them goes to a restaurant page instead.
 * "All companies" and the other two companies are not touched.
 */
export const RESTAURANT_COMPANY_NAME = "O2 Life";

type NamedCompany = { id: string; name: string };

/** True when the company ids being looked at are exactly O2 Life (the same rule as resolveCompanyScope: an id the person may not see is ignored). */
export function isRestaurantOnly(companies: NamedCompany[], accessibleIds: string[], requestedId?: string | null): boolean {
  const o2 = companies.find((c) => c.name === RESTAURANT_COMPANY_NAME);
  if (!o2) return false;
  const target = requestedId && accessibleIds.includes(requestedId) ? [requestedId] : accessibleIds;
  return target.length === 1 && target[0] === o2.id;
}

/** Same check for a page that already worked out its target company ids. */
export function isRestaurantScope(companies: NamedCompany[], targetCompanyIds: string[]): boolean {
  const o2 = companies.find((c) => c.name === RESTAURANT_COMPANY_NAME);
  return !!o2 && targetCompanyIds.length === 1 && targetCompanyIds[0] === o2.id;
}

/** Where an address made for catering goes in the restaurant view (null = the page is for every company, leave it). */
export function restaurantRedirect(pathname: string): string | null {
  const under = (root: string) => pathname === root || pathname.startsWith(`${root}/`);
  // Catering: events, calendar, quotation requests, customers of events, event report, import
  if (under("/catering")) return "/reports";
  // Admin & Finance: Event P&L, Customer Invoices, Payments Received (customer money for events)
  if (under("/finance/event-pnl") || under("/finance/invoices") || under("/finance/payment-proofs") || under("/finance/receive-payments")) return "/admin";
  // Reports about events and customer invoices
  if (under("/reports/catering") || under("/reports/event-summary") || under("/reports/revenue") || under("/reports/customer-outstanding") || under("/reports/invoice-listing")) return "/reports";
  // Kitchen: the production schedule of events (and one production order), the cooking plan of an event, the catering package menus, purchase requests from an event menu
  if (pathname === "/kitchen" || /^\/kitchen\/[0-9a-f-]{36}$/.test(pathname) || pathname === "/kitchen/new" || under("/kitchen/plan") || under("/kitchen/packages") || under("/kitchen/purchase-requests/event")) {
    return "/kitchen/recipes";
  }
  return null;
}
