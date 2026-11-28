"use client";

import { useTabVisible } from "@/components/layout/SectionAccess";
import { WorkflowTabs, type WorkGroup } from "@/components/layout/WorkflowTabs";

/**
 * In the order of the buying work: the kitchen asks, suppliers quote, a purchase order goes out, the supplier's invoice (and any credit /
 * debit note) comes in, then the statement of account. JDT snack requests have their own page; the suppliers and their items / prices
 * are the records behind it all.
 */
const GROUPS: WorkGroup[] = [
  {
    title: "Buying",
    steps: true,
    tabs: [
      { href: "/supplier-procurement/kitchen-requests", label: "Kitchen Requests", match: (p) => p.startsWith("/supplier-procurement/kitchen-requests") },
      { href: "/supplier-procurement/price-quotes", label: "Supplier Quotes", match: (p) => p.startsWith("/supplier-procurement/price-quotes") },
      { href: "/supplier-procurement/orders", label: "Purchase Orders", match: (p) => p.startsWith("/supplier-procurement/orders") || p.startsWith("/supplier-procurement/requests") },
      { href: "/supplier-procurement/invoices", label: "Invoices", match: (p) => p.startsWith("/supplier-procurement/invoices") },
      { href: "/supplier-procurement/ai-invoices", label: "AI Invoice Reader", match: (p) => p.startsWith("/supplier-procurement/ai-invoices") },
      { href: "/supplier-procurement/notes", label: "Credit / Debit Notes", match: (p) => p.startsWith("/supplier-procurement/notes") },
      { href: "/supplier-procurement/soa", label: "SOA", match: (p) => p.startsWith("/supplier-procurement/soa") },
    ],
  },
  {
    title: "JDT",
    tabs: [{ href: "/supplier-procurement/jdt-snacks", label: "JDT Snacks", match: (p) => p.startsWith("/supplier-procurement/jdt-snacks") }],
  },
  {
    title: "Suppliers & items",
    tabs: [
      { href: "/supplier-procurement", label: "Suppliers", match: (p) => p === "/supplier-procurement" || /^\/supplier-procurement\/[0-9a-f-]{36}/.test(p) },
      { href: "/supplier-procurement/items", label: "Items & Prices", match: (p) => p.startsWith("/supplier-procurement/items") },
      { href: "/supplier-procurement/vendors", label: "Vendor Contacts", match: (p) => p.startsWith("/supplier-procurement/vendors") },
    ],
  },
];

export function SupplierProcurementSubNav() {
  const visible = useTabVisible();
  return <WorkflowTabs groups={GROUPS} show={(tab) => visible(tab.href)} />;
}
