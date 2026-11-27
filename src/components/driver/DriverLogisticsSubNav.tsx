"use client";

import { useTabVisible } from "@/components/layout/SectionAccess";
import { WorkflowTabs, type WorkGroup } from "@/components/layout/WorkflowTabs";

/**
 * In the order of the day's work: plan the staff (duty roster), they clock in, the equipment is checked, the deliveries go out and are
 * followed on the dashboard. The drivers' and vehicles' records and the vehicle maintenance are kept apart.
 */
const GROUPS: WorkGroup[] = [
  {
    title: "Daily work (in order)",
    steps: true,
    tabs: [
      { href: "/driver-logistics/duty-roster", label: "Daily Duty Roster", match: (p) => p.startsWith("/driver-logistics/duty-roster") },
      { href: "/driver-logistics/attendance", label: "Attendance (Clock In / Out)", match: (p) => p.startsWith("/driver-logistics/attendance") },
      { href: "/driver-logistics/equipment", label: "Equipment Checklist", match: (p) => p.startsWith("/driver-logistics/equipment") },
      { href: "/driver-logistics", label: "Deliveries", match: (p) => p === "/driver-logistics" || /^\/driver-logistics\/[0-9a-f-]{36}$/.test(p) },
      { href: "/driver-logistics/dashboard", label: "Driver Dashboard", match: (p) => p.startsWith("/driver-logistics/dashboard") },
    ],
  },
  {
    title: "Drivers & vehicles",
    tabs: [
      { href: "/driver-logistics/drivers", label: "Drivers Information", match: (p) => p.startsWith("/driver-logistics/drivers") },
      { href: "/driver-logistics/vehicles", label: "Vehicles", match: (p) => p.startsWith("/driver-logistics/vehicles") },
      { href: "/driver-logistics/maintenance", label: "Maintenance", match: (p) => p.startsWith("/driver-logistics/maintenance") },
    ],
  },
];

export function DriverLogisticsSubNav() {
  const visible = useTabVisible();
  return <WorkflowTabs groups={GROUPS} show={(tab) => visible(tab.href)} />;
}
