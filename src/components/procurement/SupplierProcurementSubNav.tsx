"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/supplier-procurement", label: "Suppliers", match: (p: string) => p === "/supplier-procurement" || /^\/supplier-procurement\/[0-9a-f-]{36}/.test(p) },
  { href: "/supplier-procurement/items", label: "Items & Prices", match: (p: string) => p.startsWith("/supplier-procurement/items") },
  { href: "/supplier-procurement/ingredient-matching", label: "Ingredient Matching", match: (p: string) => p.startsWith("/supplier-procurement/ingredient-matching") },
  { href: "/supplier-procurement/kitchen-requests", label: "Kitchen Requests", match: (p: string) => p.startsWith("/supplier-procurement/kitchen-requests") },
  { href: "/supplier-procurement/price-quotes", label: "Supplier Quotes", match: (p: string) => p.startsWith("/supplier-procurement/price-quotes") },
  { href: "/supplier-procurement/orders", label: "Purchase Orders", match: (p: string) => p.startsWith("/supplier-procurement/orders") || p.startsWith("/supplier-procurement/requests") },
  { href: "/supplier-procurement/invoices", label: "Invoices", match: (p: string) => p.startsWith("/supplier-procurement/invoices") },
  { href: "/supplier-procurement/notes", label: "Credit / Debit Notes", match: (p: string) => p.startsWith("/supplier-procurement/notes") },
  { href: "/supplier-procurement/payments", label: "Payments", match: (p: string) => p.startsWith("/supplier-procurement/payments") },
];

export function SupplierProcurementSubNav() {
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
