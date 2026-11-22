"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTabVisible } from "@/components/layout/SectionAccess";

type Tab = { href: string; label: string; match: (p: string) => boolean };

const GROUPS: { title: string; tabs: Tab[] }[] = [
  {
    title: "Manage Drivers",
    tabs: [
      { href: "/driver-logistics", label: "Deliveries", match: (p) => p === "/driver-logistics" || /^\/driver-logistics\/[0-9a-f-]{36}$/.test(p) },
      { href: "/driver-logistics/dashboard", label: "Driver Dashboard", match: (p) => p.startsWith("/driver-logistics/dashboard") },
      { href: "/driver-logistics/drivers", label: "Drivers Information", match: (p) => p.startsWith("/driver-logistics/drivers") },
      { href: "/driver-logistics/vehicles", label: "Vehicles", match: (p) => p.startsWith("/driver-logistics/vehicles") },
      { href: "/driver-logistics/maintenance", label: "Maintenance", match: (p) => p.startsWith("/driver-logistics/maintenance") },
    ],
  },
  {
    title: "Manage My Staff",
    tabs: [{ href: "/driver-logistics/attendance", label: "Attendance (Clock In / Out)", match: (p) => p.startsWith("/driver-logistics/attendance") }],
  },
];

export function DriverLogisticsSubNav() {
  const pathname = usePathname();
  const visible = useTabVisible();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border">
      {GROUPS.filter((group) => group.tabs.some((t) => visible(t.href))).map((group) => (
        <div key={group.title}>
          <div className="px-3.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-text-muted">{group.title}</div>
          <div className="flex flex-wrap gap-1">
            {group.tabs.filter((tab) => visible(tab.href)).map((tab) => {
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
        </div>
      ))}
    </div>
  );
}
