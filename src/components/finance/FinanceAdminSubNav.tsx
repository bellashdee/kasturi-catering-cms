"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Monthly Costing", match: (p: string) => p === "/admin" },
  { href: "/finance/invoices", label: "Customer Invoices", match: (p: string) => p.startsWith("/finance/invoices") },
  { href: "/finance/outstanding", label: "Outstanding Payment", match: (p: string) => p.startsWith("/finance/outstanding") },
  { href: "/finance/payments", label: "Payment Dashboard", match: (p: string) => p.startsWith("/finance/payments") || p.startsWith("/finance/payment-accounts") },
  { href: "/finance/supplier-payment", label: "Supplier Payment", match: (p: string) => p.startsWith("/finance/supplier-payment") },
  { href: "/finance/rental-payment", label: "Rental Payment", match: (p: string) => p.startsWith("/finance/rental-payment") },
  { href: "/finance/utilities-payment", label: "Utilities Payment", match: (p: string) => p.startsWith("/finance/utilities-payment") },
  { href: "/supplier-procurement/payments", label: "Procurement Payments", match: (p: string) => p.startsWith("/supplier-procurement/payments") },
  { href: "/finance/expenses", label: "Company Expenses", match: (p: string) => p.startsWith("/finance/expenses") },
  { href: "/finance/petty-cash", label: "Petty Cash", match: (p: string) => p.startsWith("/finance/petty-cash") },
  { href: "/admin/budgets", label: "Budgets", match: (p: string) => p.startsWith("/admin/budgets") },
  { href: "/admin/categories", label: "Categories", match: (p: string) => p.startsWith("/admin/categories") },
];

export function FinanceAdminSubNav() {
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
