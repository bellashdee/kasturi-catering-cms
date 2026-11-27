"use client";

import { useTabVisible } from "@/components/layout/SectionAccess";
import { WorkflowTabs, type WorkGroup } from "@/components/layout/WorkflowTabs";

/**
 * In the order of the sales work: a quotation request comes in, it becomes an event, the event sits on the calendar, the meals and pax are
 * followed, then the report. The customers and the event import are records kept apart.
 */
const GROUPS: WorkGroup[] = [
  {
    title: "Sales & events",
    steps: true,
    tabs: [
      { href: "/catering/quotation-requests", label: "Quotation Requests", match: (p) => p.startsWith("/catering/quotation-requests") },
      { href: "/catering", label: "Events", match: (p) => p === "/catering" || p === "/catering/new" || /^\/catering\/[0-9a-f-]{36}/.test(p) },
      { href: "/catering/calendar", label: "Event Calendar", match: (p) => p.startsWith("/catering/calendar") },
      { href: "/catering/meals-pax", label: "Meals & Pax", match: (p) => p.startsWith("/catering/meals-pax") },
      { href: "/catering/event-report", label: "Event Report", match: (p) => p.startsWith("/catering/event-report") },
    ],
  },
  {
    title: "Records",
    tabs: [
      { href: "/catering/customers", label: "Customers", match: (p) => p.startsWith("/catering/customers") },
      { href: "/catering/import", label: "Import Events", match: (p) => p.startsWith("/catering/import") },
    ],
  },
];

export function CateringSubNav() {
  const visible = useTabVisible();
  return <WorkflowTabs groups={GROUPS} show={(tab) => visible(tab.href)} />;
}
