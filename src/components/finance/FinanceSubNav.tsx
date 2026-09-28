"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/finance-admin", label: "Monthly Summary", match: (p: string) => p === "/finance-admin" },
  { href: "/finance-admin/invoices", label: "Customer Invoices", match: (p: string) => p.startsWith("/finance-admin/invoices") },
  { href: "/finance-admin/expenses", label: "Company Expenses", match: (p: string) => p.startsWith("/finance-admin/expenses") },
  { href: "/finance-admin/petty-cash", label: "Petty Cash", match: (p: string) => p.startsWith("/finance-admin/petty-cash") },
  { href: "/finance-admin/budgets", label: "Budgets", match: (p: string) => p.startsWith("/finance-admin/budgets") },
  { href: "/finance-admin/categories", label: "Categories", match: (p: string) => p.startsWith("/finance-admin/categories") },
];

export function FinanceSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
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
