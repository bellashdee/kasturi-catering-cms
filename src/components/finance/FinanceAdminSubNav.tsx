"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTabVisible } from "@/components/layout/SectionAccess";
import { useCanOpenModule, useRestaurantView } from "@/components/layout/RestaurantView";

type Match = (path: string, params: URLSearchParams) => boolean;
type Page = { href: string; label: string; match: Match };
/** A tab of the Admin & Finance row. A tab with pages opens its first page the member may open, and shows its pages as a second row of tabs. */
type Tab = Page | { label: string; pages: Page[]; alsoMatch?: Match };

const isCategory = (params: URLSearchParams, category: string) => (params.get("category") ?? "supplier") === category;

// in the order of the money work: bill the customers, receive their payments, pay suppliers / rental / utilities, follow what is still
// owed, then the results (Event P&L, Monthly Costing)
const TABS: Tab[] = [
  { href: "/finance/invoices", label: "Customer Invoices", match: (p) => p.startsWith("/finance/invoices") },
  { href: "/finance/payment-proofs", label: "Payments Received", match: (p) => p.startsWith("/finance/payment-proofs") || p.startsWith("/finance/receive-payments") },
  {
    label: "Supplier, Rental & Utilities",
    pages: [
      { href: "/finance/supplier-payment", label: "Supplier Payment", match: (p, q) => p.startsWith("/finance/supplier-payment") || (p.startsWith("/finance/payment-accounts") && isCategory(q, "supplier")) },
      { href: "/finance/rental-payment", label: "Rental Payment", match: (p, q) => p.startsWith("/finance/rental-payment") || (p.startsWith("/finance/payment-accounts") && isCategory(q, "rental")) },
      { href: "/finance/utilities-payment", label: "Utilities Payment", match: (p, q) => p.startsWith("/finance/utilities-payment") || (p.startsWith("/finance/payment-accounts") && isCategory(q, "utility")) },
    ],
    // one payment opened from a list (/finance/payments/<id>)
    alsoMatch: (p) => /^\/finance\/payments\/(?!checklist)[^/]+/.test(p),
  },
  {
    label: "Payment Overview",
    pages: [
      { href: "/finance/payments", label: "Payment Dashboard", match: (p) => p === "/finance/payments" },
      { href: "/finance/payments/checklist", label: "Payment Checklist", match: (p) => p.startsWith("/finance/payments/checklist") },
      { href: "/finance/outstanding", label: "Outstanding Payment", match: (p) => p.startsWith("/finance/outstanding") },
    ],
  },
  { href: "/finance/event-pnl", label: "Event P&L", match: (p) => p.startsWith("/finance/event-pnl") },
  { href: "/admin", label: "Monthly Costing", match: (p) => p === "/admin" },
];

/** Made for catering events and their customers: not shown while O2 Life (the restaurant) is the only company viewed. */
const EVENT_TABS = new Set(["/finance/event-pnl", "/finance/invoices", "/finance/payment-proofs"]);
/** The restaurant's own tab, after Monthly Costing: sales, raw item cost, labour, utilities and net profit by month (a page of Reports). */
const BREAKDOWN_TAB: Page = { href: "/reports/monthly-breakdown", label: "Monthly Breakdown", match: (p) => p.startsWith("/reports/monthly-breakdown") };

const TAB_CLASS = "border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold";
const tabClass = (active: boolean) => `${TAB_CLASS} ${active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`;

export function FinanceAdminSubNav() {
  const pathname = usePathname();
  const visible = useTabVisible();
  const restaurant = useRestaurantView();
  const canOpenReports = useCanOpenModule("reports");
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const company = searchParams.get("company");
  const withCompany = (href: string) => (company ? `${href}?company=${company}` : href);

  // the restaurant's Monthly Breakdown follows Monthly Costing
  const costingAt = TABS.findIndex((t) => "href" in t && t.href === "/admin");
  const tabs: Tab[] = restaurant && canOpenReports ? [...TABS.slice(0, costingAt + 1), BREAKDOWN_TAB, ...TABS.slice(costingAt + 1)] : TABS;
  const row = tabs.flatMap((tab) => {
    if ("href" in tab) {
      if (!visible(tab.href) || (restaurant && EVENT_TABS.has(tab.href))) return [];
      return [{ key: tab.href, label: tab.label, href: tab.href, active: tab.match(pathname, params), pages: [] as Page[] }];
    }
    const pages = tab.pages.filter((page) => visible(page.href));
    if (pages.length === 0) return [];
    const active = pages.some((page) => page.match(pathname, params)) || !!tab.alsoMatch?.(pathname, params);
    return [{ key: tab.label, label: tab.label, href: pages[0].href, active, pages }];
  });
  const inner = row.find((tab) => tab.active)?.pages ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {row.map((tab) => (
          <Link key={tab.key} href={withCompany(tab.href)} className={tabClass(tab.active)}>
            {tab.label}
          </Link>
        ))}
      </div>
      {inner.length > 1 && (
        <div className="flex flex-wrap gap-1 self-start rounded-xl border border-border bg-surface-alt p-1">
          {inner.map((page) => {
            const active = page.match(pathname, params);
            return (
              <Link
                key={page.href}
                href={withCompany(page.href)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ${active ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text"}`}
              >
                {page.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
