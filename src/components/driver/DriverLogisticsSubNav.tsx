"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/driver-logistics", label: "Deliveries", match: (p: string) => p === "/driver-logistics" || /^\/driver-logistics\/[0-9a-f-]{36}$/.test(p) },
  { href: "/driver-logistics/drivers", label: "Drivers", match: (p: string) => p.startsWith("/driver-logistics/drivers") },
  { href: "/driver-logistics/vehicles", label: "Vehicles", match: (p: string) => p.startsWith("/driver-logistics/vehicles") },
  { href: "/driver-logistics/maintenance", label: "Maintenance", match: (p: string) => p.startsWith("/driver-logistics/maintenance") },
  { href: "/driver-logistics/expenses", label: "Expenses", match: (p: string) => p.startsWith("/driver-logistics/expenses") },
];

export function DriverLogisticsSubNav() {
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
