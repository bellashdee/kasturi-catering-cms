"use client";

import { useTabVisible } from "@/components/layout/SectionAccess";
import { useIncludesRestaurant, useRestaurantView } from "@/components/layout/RestaurantView";
import { WorkflowTabs, type WorkGroup } from "@/components/layout/WorkflowTabs";

/**
 * In the order of the kitchen's work: see the events to cook for, plan the cooking, ask Purchasing for what is missing, receive / check
 * the stock (and the restaurant's wastage), then the day's report. The kitchen staff roster and the menus / recipes are set up apart.
 */
const GROUPS: WorkGroup[] = [
  {
    title: "Daily work (in order)",
    steps: true,
    tabs: [
      { href: "/kitchen", label: "Production Schedule", match: (p) => p === "/kitchen" || /^\/kitchen\/[0-9a-f-]{36}$/.test(p) },
      { href: "/kitchen/plan", label: "Cooking Plan", match: (p) => p.startsWith("/kitchen/plan") },
      { href: "/kitchen/purchase-requests", label: "Purchase Requests", match: (p) => p.startsWith("/kitchen/purchase-requests") },
      { href: "/kitchen/stock", label: "Stock", match: (p) => p.startsWith("/kitchen/stock") },
      { href: "/kitchen/wastage", label: "Wastage", match: (p) => p.startsWith("/kitchen/wastage") },
      { href: "/kitchen/reports", label: "Daily Report", match: (p) => p.startsWith("/kitchen/reports") },
    ],
  },
  {
    title: "Kitchen staff",
    tabs: [{ href: "/kitchen/roster", label: "Duty Roster", match: (p) => p.startsWith("/kitchen/roster") }],
  },
  {
    title: "Menus & recipes",
    tabs: [
      { href: "/kitchen/packages", label: "Package Menu", match: (p) => p.startsWith("/kitchen/packages") },
      { href: "/kitchen/recipes", label: "Recipes", match: (p) => p.startsWith("/kitchen/recipes") },
    ],
  },
];

/** Made for catering events: not shown while O2 Life (the restaurant) is the only company viewed. */
const EVENT_TABS = new Set(["/kitchen", "/kitchen/plan", "/kitchen/packages"]);

/** The Wastage Log is the restaurant's: shown when O2 Life is among the companies viewed (the catering companies keep the stock wastage). It follows the Stock section for who may see it. */
const RESTAURANT_TABS = new Set(["/kitchen/wastage"]);

export function KitchenSubNav() {
  const visible = useTabVisible();
  const restaurant = useRestaurantView();
  const includesRestaurant = useIncludesRestaurant();
  return (
    <WorkflowTabs
      groups={GROUPS}
      show={(tab) => visible(RESTAURANT_TABS.has(tab.href) ? "/kitchen/stock" : tab.href) && !(restaurant && EVENT_TABS.has(tab.href)) && (includesRestaurant || !RESTAURANT_TABS.has(tab.href))}
    />
  );
}
