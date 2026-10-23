"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/kitchen", label: "Production Schedule", match: (p: string) => p === "/kitchen" || /^\/kitchen\/[0-9a-f-]{36}$/.test(p) },
  { href: "/kitchen/recipes", label: "Recipes", match: (p: string) => p.startsWith("/kitchen/recipes") },
  { href: "/kitchen/packages", label: "Package Menu", match: (p: string) => p.startsWith("/kitchen/packages") },
  { href: "/kitchen/stock", label: "Stock", match: (p: string) => p.startsWith("/kitchen/stock") },
  { href: "/kitchen/purchase-requests", label: "Purchase Requests", match: (p: string) => p.startsWith("/kitchen/purchase-requests") },
  { href: "/kitchen/reports", label: "Daily Report", match: (p: string) => p.startsWith("/kitchen/reports") },
  { href: "/ingredient-calculator", label: "Ingredient Calculator", match: (p: string) => p.startsWith("/ingredient-calculator") },
];

export function KitchenSubNav() {
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
