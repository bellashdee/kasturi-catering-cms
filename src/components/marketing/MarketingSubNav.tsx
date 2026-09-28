"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/marketing", label: "Campaigns", match: (p: string) => p === "/marketing" || /^\/marketing\/[^/]+$/.test(p) },
  { href: "/marketing/content", label: "Content Calendar", match: (p: string) => p.startsWith("/marketing/content") },
  { href: "/marketing/leads", label: "Leads", match: (p: string) => p.startsWith("/marketing/leads") },
  { href: "/marketing/customers", label: "Customers", match: (p: string) => p.startsWith("/marketing/customers") },
  { href: "/marketing/promotions", label: "Promotions", match: (p: string) => p.startsWith("/marketing/promotions") },
  { href: "/marketing/expenses", label: "Expenses", match: (p: string) => p.startsWith("/marketing/expenses") },
  { href: "/marketing/reports", label: "Reports", match: (p: string) => p.startsWith("/marketing/reports") },
];

export function MarketingSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        const href = company ? `${tab.href}?company=${company}` : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${
              active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
