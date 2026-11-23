"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/restaurant", label: "Dashboard", exact: true },
  { href: "/restaurant/sales", label: "Daily Sales", exact: false },
  { href: "/restaurant/import", label: "Import FeedMe", exact: false },
  { href: "/restaurant/cash", label: "Cash Sessions", exact: false },
  { href: "/restaurant/menu", label: "Menu", exact: false },
  { href: "/restaurant/ingredients", label: "Ingredients", exact: false },
  { href: "/restaurant/margin", label: "Margin Report", exact: false },
  { href: "/restaurant/roles", label: "Staff Roles", exact: false, adminOnly: true },
];

/** The tabs of the Restaurant module (O2 Life). The company viewed is kept in every link. */
export function RestaurantSubNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const company = useSearchParams().get("company");
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.filter((t) => !t.adminOnly || isAdmin).map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={company ? `${tab.href}?company=${company}` : tab.href}
            className={`border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
