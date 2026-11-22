/** The lists with the month filter (MonthFilter): opened without a month, they open on this month (Malaysia), not on all months. */
export const MONTH_FILTER_PAGES = new Set([
  "/bulletin",
  "/catering/customers/submissions",
  "/catering",
  "/catering/quotation-requests",
  "/catering/quotations",
  "/driver-logistics/attendance",
  "/driver-logistics/maintenance",
  "/driver-logistics",
  "/finance/invoices",
  "/finance/payment-proofs",
  "/hr/documents",
  "/hr/leave",
  "/hr/payroll",
  "/hr/probation",
  "/kitchen",
  "/kitchen/plan",
  "/kitchen/purchase-requests",
  "/kitchen/stock",
  "/kitchen/wastage",
  "/marketing/content",
  "/marketing/customers",
  "/marketing/expenses",
  "/marketing/leads",
  "/marketing",
  "/marketing/promotions",
  "/marketing/reports",
  "/spending/budgets",
  "/spending/expenses",
  "/supplier-procurement/invoices",
  "/supplier-procurement/items",
  "/supplier-procurement/kitchen-requests",
  "/supplier-procurement/notes",
  "/supplier-procurement/orders",
  "/supplier-procurement/price-quotes",
]);
export const thisMonthInMalaysia = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);

/** A menu link to a month list goes straight to this month (the proxy would otherwise answer with a redirect first: one more round trip per click). */
export function withThisMonth(path: string, query: string): string {
  if (!MONTH_FILTER_PAGES.has(path)) return query ? `${path}?${query}` : path;
  const month = `month=${thisMonthInMalaysia()}`;
  return `${path}?${query ? `${query}&` : ""}${month}`;
}
