"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTabVisible } from "@/components/layout/SectionAccess";
import { useIncludesRestaurant, useRestaurantView } from "@/components/layout/RestaurantView";

const TABS = [
  { href: "/kitchen", label: "Production Schedule", match: (p: string) => p === "/kitchen" || /^\/kitchen\/[0-9a-f-]{36}$/.test(p) },
  { href: "/kitchen/plan", label: "Cooking Plan", match: (p: string) => p.startsWith("/kitchen/plan") },
  { href: "/kitchen/recipes", label: "Recipes", match: (p: string) => p.startsWith("/kitchen/recipes") },
  { href: "/kitchen/packages", label: "Package Menu", match: (p: string) => p.startsWith("/kitchen/packages") },
  { href: "/kitchen/stock", label: "Stock", match: (p: string) => p.startsWith("/kitchen/stock") },
  { href: "/kitchen/wastage", label: "Wastage", match: (p: string) => p.startsWith("/kitchen/wastage") },
  { href: "/kitchen/purchase-requests", label: "Purchase Requests", match: (p: string) => p.startsWith("/kitchen/purchase-requests") },
  { href: "/kitchen/reports", label: "Daily Report", match: (p: string) => p.startsWith("/kitchen/reports") },
];

/** Made for catering events: not shown while O2 Life (the restaurant) is the only company viewed. */
const EVENT_TABS = new Set(["/kitchen", "/kitchen/plan", "/kitchen/packages"]);

/** The Wastage Log is the restaurant's: shown when O2 Life is among the companies viewed (the catering companies keep the stock wastage). It follows the Stock section for who may see it. */
const RESTAURANT_TABS = new Set(["/kitchen/wastage"]);

export function KitchenSubNav() {
  const pathname = usePathname();
  const visible = useTabVisible();
  const restaurant = useRestaurantView();
  const includesRestaurant = useIncludesRestaurant();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.filter((tab) => visible(RESTAURANT_TABS.has(tab.href) ? "/kitchen/stock" : tab.href) && !(restaurant && EVENT_TABS.has(tab.href)) && (includesRestaurant || !RESTAURANT_TABS.has(tab.href))).map((tab) => {
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
