"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MODULES } from "@/lib/constants";

const ICONS: Record<string, React.ReactNode> = {
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

function NavItem({ href, icon, label, matchPrefixes, badge }: { href: string; icon: string; label: string; matchPrefixes?: string[]; badge?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === href || (matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false);
  const company = searchParams.get("company");
  const fullHref = company ? `${href}?company=${company}` : href;

  return (
    <Link
      href={fullHref}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition ${
        active
          ? "border-l-[3px] border-accent bg-sidebar-active pl-[9px] font-semibold text-sidebar-active-text shadow-sm"
          : "font-medium text-sidebar-text/75 hover:bg-sidebar-field hover:text-sidebar-text"
      }`}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {badge ? (
        <span title="Waiting for your review" className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function MainDashboardLink() {
  return <NavItem href="/" icon="dashboard" label="Main Dashboard" />;
}

export function PriorityCentreLink({ label = "Priority Centre" }: { label?: string }) {
  return <NavItem href="/priority-centre" icon="priority" label={label} />;
}

export function BulletinLink() {
  return <NavItem href="/bulletin" icon="bulletin" label="Bulletin Board" />;
}

export function PayrollCentreLink() {
  return <NavItem href="/payroll-centre" icon="payroll" label="Payroll Centre" />;
}

export function ModuleLinks({ allowedModules, badges = {} }: { allowedModules: string[] | null; badges?: Record<string, number> }) {
  const show = (key: string) => !allowedModules || allowedModules.includes(key);
  return (
    <>
      {MODULES.filter((m) => m.key !== "reports" && m.key !== "ai-assistant" && m.key !== "marketing" && show(m.key)).map((m) => (
        <NavItem key={m.key} href={m.href} icon={m.key} label={m.label} matchPrefixes={m.matchPrefixes} badge={badges[m.key]} />
      ))}
      {!show("hr") && show("overtime") && <NavItem href="/hr/overtime" icon="hr" label="Overtime (OT)" />}
      {show("reports") && <NavItem href="/reports" icon="reports" label="Reports" />}
      {show("ai-assistant") && <NavItem href="/ai-assistant" icon="ai-assistant" label="🤖 AI Assistant" />}
    </>
  );
}

export function SettingsLink() {
  return <NavItem href="/settings" icon="settings" label="Settings" />;
}
