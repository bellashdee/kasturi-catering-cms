"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTabVisible } from "@/components/layout/SectionAccess";

const TABS = [
  { href: "/catering", label: "Events", match: (p: string) => p === "/catering" || p === "/catering/new" || /^\/catering\/[0-9a-f-]{36}/.test(p) },
  { href: "/catering/calendar", label: "Event Calendar", match: (p: string) => p.startsWith("/catering/calendar") },
  { href: "/catering/quotation-requests", label: "Quotation Request Inbox", match: (p: string) => p.startsWith("/catering/quotation-requests") },
  { href: "/catering/import", label: "Import Events", match: (p: string) => p.startsWith("/catering/import") },
  { href: "/catering/event-report", label: "Event Report", match: (p: string) => p.startsWith("/catering/event-report") },
  { href: "/catering/customers", label: "Customers", match: (p: string) => p.startsWith("/catering/customers") },
];

export function CateringSubNav() {
  const pathname = usePathname();
  const visible = useTabVisible();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.filter((tab) => visible(tab.href)).map((tab) => {
        const active = tab.match(pathname);
        const href = company ? `${tab.href}?company=${company}` : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
