"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MODULES } from "@/lib/constants";
import { moduleHref } from "@/lib/sections";
import { withThisMonth } from "@/lib/monthPages";
import { useAllowedSections } from "@/components/layout/SectionAccess";
import { useRestaurantView } from "@/components/layout/RestaurantView";
import { RESTAURANT_MODULE_LABEL } from "@/lib/restaurantView";

const ICONS: Record<string, React.ReactNode> = {
  profile: (
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.5 17c.6-3.2 3.2-5.2 6.5-5.2s5.9 2 6.5 5.2" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.2" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" />
    </>
  ),
  priority: (
    <>
      <path d="M5 3h10v14H5z" />
      <path d="M8 7l1.2 1.2L12 5.5M8 12l1.2 1.2L12 10.5" />
    </>
  ),
  bulletin: (
    <>
      <path d="M3 8v4l9 3V5L3 8z" />
      <path d="M12 7.5a2.5 2.5 0 0 1 0 5" />
      <path d="M5 12.5l1 4h2l-1-3.5" />
    </>
  ),
  payroll: (
    <>
      <rect x="3" y="5" width="14" height="10" rx="2" />
      <path d="M3 9h14" />
      <path d="M6 12.5h3" />
    </>
  ),
  "petty-cash": (
    <>
      <path d="M3 6.5h12.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15V6.5Z" />
      <path d="M3 6.5 13 3.2v3.3" />
      <circle cx="13.2" cy="11.5" r="1.1" />
    </>
  ),
  hr: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </>
  ),
  marketing: (
    <>
      <path d="M3 14l5-5 4 4 6-7" />
      <path d="M13 6h5v5" />
    </>
  ),
  catering: (
    <>
      <path d="M3 15a7 7 0 0 1 14 0" />
      <line x1="2" y1="15" x2="18" y2="15" />
    </>
  ),
  kitchen: (
    <>
      <ellipse cx="10" cy="7" rx="5" ry="4" />
      <rect x="6" y="13" width="8" height="4" rx="1" />
    </>
  ),
  "driver-logistics": (
    <>
      <rect x="2" y="7" width="9" height="7" rx="1" />
      <path d="M11 10h4l3 3v1h-7z" />
      <circle cx="6" cy="16" r="1.6" />
      <circle cx="15" cy="16" r="1.6" />
    </>
  ),
  "supplier-procurement": (
    <>
      <path d="M3 7l7-4 7 4-7 4-7-4z" />
      <path d="M3 7v7l7 4 7-4V7" />
    </>
  ),
  "finance-admin": (
    <>
      <rect x="3" y="6" width="14" height="10" rx="2" />
      <circle cx="10" cy="11" r="2.2" />
    </>
  ),
  restaurant: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3.2" />
      <path d="M2 4v4M3.6 4v4M5.2 4v4M3.6 8v8M17 4c-1.2 1.2-1.6 3-1.6 5h1.6v7" />
    </>
  ),
  "ingredient-calculator": (
    <>
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <path d="M7 6h6M7 9h.01M10 9h.01M13 9h.01M7 12h.01M10 12h.01M13 12h.01M7 15h.01M10 15h.01" />
    </>
  ),
  reports: (
    <>
      <rect x="4" y="11" width="3" height="6" />
      <rect x="9" y="7" width="3" height="10" />
      <rect x="14" y="4" width="3" height="13" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.5 5.5l1.4 1.4M13.1 13.1l1.4 1.4M14.5 5.5l-1.4 1.4M6.9 13.1l-1.4 1.4" />
    </>
  ),
  companies: (
    <>
      <path d="M4 17V4.5h8V17" />
      <path d="M12 8.5h4V17" />
      <path d="M2.5 17h15M7 7.5h2M7 10.5h2M7 13.5h2" />
    </>
  ),
  "ai-assistant": (
    <>
      <rect x="4" y="5" width="12" height="9" rx="2.5" />
      <path d="M10 2v3M7 9.5h.01M13 9.5h.01" />
      <path d="M6 14v2M14 14v2" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICONS[name]}
    </svg>
  );
}

/** True while the side bar is closed to its icons (only on a computer: the phone menu always shows the words). */
export const SidebarCollapsedContext = createContext(false);
export const useSidebarCollapsed = () => useContext(SidebarCollapsedContext);

/** The words of a link: they disappear while the side bar is closed. */
export const labelClass = (collapsed: boolean) => (collapsed ? "md:hidden" : "");

/** The page you are on: a filled tan pill with dark text, the same in every company look. */
export const ACTIVE_PILL = "bg-[#d2b185] font-bold text-[#2b2318] shadow-sm";

/** A group of links that opens and closes (chevron on the right); the links inside hang from a thin line on the left. */
export function NavGroup({ icon, label, children, defaultOpen = true, hasActive = false }: { icon: string; label: string; children: React.ReactNode; defaultOpen?: boolean; hasActive?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const collapsed = useSidebarCollapsed();
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] font-medium transition hover:bg-sidebar-field ${collapsed ? "md:justify-center md:px-0" : ""} ${hasActive ? "bg-sidebar-field text-sidebar-text" : "text-sidebar-text/75"}`}
      >
        <Icon name={icon} />
        <span className={`flex-1 ${labelClass(collapsed)}`}>{label}</span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? "" : "rotate-180"} ${labelClass(collapsed)}`} aria-hidden="true">
          <path d="M5 12.5l5-5 5 5" />
        </svg>
      </button>
      {(open || collapsed) && (
        <div className={`ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-line pl-2.5 ${collapsed ? "md:ml-0 md:items-center md:border-l-0 md:pl-0" : ""}`}>{children}</div>
      )}
    </div>
  );
}

function NavItem({ href, icon, label, matchPrefixes, badge }: { href: string; icon: string; label: string; matchPrefixes?: string[]; badge?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === href || (matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false);
  const company = searchParams.get("company");
  const fullHref = withThisMonth(href, company ? `company=${company}` : "");
  const collapsed = useSidebarCollapsed();

  return (
    <Link
      href={fullHref}
      title={label}
      className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] transition ${collapsed ? "md:justify-center md:px-0" : ""} ${
        active ? ACTIVE_PILL : "font-medium text-sidebar-text/75 hover:bg-sidebar-field hover:text-sidebar-text"
      }`}
    >
      <Icon name={icon} />
      <span className={labelClass(collapsed)}>{label}</span>
      {badge ? (
        <span title="Waiting for your review" className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full border border-current bg-danger px-1.5 text-[11px] font-bold text-white ${collapsed ? "md:absolute md:right-1 md:top-0.5 md:h-4 md:min-w-4 md:px-1 md:text-[9px]" : ""}`}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** My Profile: the first link of the side bar, every person's own details. */
export function ProfileLink() {
  return <NavItem href="/profile" icon="profile" label="My Profile" />;
}

export function MainDashboardLink() {
  return <NavItem href="/" icon="dashboard" label="Main Dashboard" />;
}

/** The links under Main Dashboard: the person's own work first (Priority Centre / My Tasks), then the Bulletin Board. */
export function TopLinks({ taskLabel = "Priority Centre" }: { taskLabel?: string }) {
  // the Signature Solution Dashboard (JDT schedule, quotation requests, snack requests); not for the restaurant view
  const restaurant = useRestaurantView();
  return (
    <>
      <NavItem href="/priority-centre" icon="priority" label={taskLabel} />
      <NavItem href="/bulletin" icon="bulletin" label="Bulletin Board" />
      {!restaurant && <NavItem href="/signature-dashboard" icon="dashboard" label="Signature Dashboard" />}
    </>
  );
}

/**
 * The modules in the order the work goes: the event is sold (Catering), cooked (Kitchen), bought for (Supplier & Procurement), delivered
 * (Operation Management), then paid and accounted for (Admin & Finance, Company Spending), then the staff (HR), the Reports and the AI Assistant.
 * The Payroll Centre is part of HR (a button on the HR page); only a payroll user who has no HR access gets its own entry.
 * While O2 Life (the restaurant) is the only company viewed the list follows the restaurant's day instead: the kitchen and its stock, the
 * suppliers, the spending, the money, the staff, the Reports and the AI Assistant (no Catering, no Operation Management).
 */
export function ModuleLinks({ allowedModules, badges = {}, showPayroll = false }: { allowedModules: string[] | null; badges?: Record<string, number>; showPayroll?: boolean }) {
  const show = (key: string) => !allowedModules || allowedModules.includes(key);
  const allowedSections = useAllowedSections();
  // O2 Life is the restaurant (Restoran Bara Ikan Bakar Senibong): no Catering, and the Kitchen opens on its recipes, not on the event schedule
  const restaurant = useRestaurantView();
  const moduleLink = (key: string) => {
    const m = MODULES.find((x) => x.key === key);
    if (!m || !show(key)) return null;
    if (restaurant && key === "kitchen") return <NavItem key={key} href="/kitchen/recipes" icon={key} label={RESTAURANT_MODULE_LABEL[key]} matchPrefixes={["/kitchen"]} badge={badges[key]} />;
    return <NavItem key={key} href={moduleHref(key, m.href, allowedSections)} icon={key} label={m.label} matchPrefixes={m.matchPrefixes} badge={badges[key]} />;
  };
  const spending = <NavItem href="/spending" icon="petty-cash" label="Company Spending" matchPrefixes={["/spending"]} />;
  const hrLinks = (
    <>
      {moduleLink("hr")}
      {!show("hr") && showPayroll && <NavItem href="/payroll-centre" icon="payroll" label="Payroll Centre" />}
      {!show("hr") && show("overtime") && <NavItem href="/hr/overtime" icon="hr" label="Overtime (OT)" />}
    </>
  );
  if (restaurant) {
    return (
      <>
        {moduleLink("restaurant")}
        {moduleLink("kitchen")}
        {moduleLink("supplier-procurement")}
        {spending}
        {moduleLink("finance-admin")}
        {hrLinks}
        {show("reports") && <NavItem href="/reports" icon="reports" label="Reports" />}
        <NavItem href="/ai-assistant" icon="ai-assistant" label="🤖 AI Assistant" />
      </>
    );
  }
  return (
    <>
      {moduleLink("catering")}
      {moduleLink("kitchen")}
      {moduleLink("supplier-procurement")}
      {moduleLink("driver-logistics")}
      {moduleLink("finance-admin")}
      {/* Company Spending is for everybody: staff send their own claims (My Claims) there; the finance and petty cash pages follow their own access */}
      {spending}
      {hrLinks}
      {show("reports") && <NavItem href="/reports" icon="reports" label="Reports" />}
      <NavItem href="/ai-assistant" icon="ai-assistant" label="🤖 AI Assistant" />
    </>
  );
}

export function SettingsLink() {
  return <NavItem href="/settings" icon="settings" label="Settings" />;
}
