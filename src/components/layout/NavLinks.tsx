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
      <circle cx="14" cy="11" r="1.6" />
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
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICONS[name]}
    </svg>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: string; label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === href;
  const company = searchParams.get("company");
  const fullHref = company ? `${href}?company=${company}` : href;

  return (
    <Link
      href={fullHref}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition ${
        active
          ? "border-l-[3px] border-primary bg-white/10 pl-[9px] font-semibold text-white"
          : "font-medium text-white/65 hover:text-white/90"
      }`}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}

export function MainDashboardLink() {
  return <NavItem href="/" icon="dashboard" label="Main Dashboard" />;
}

export function ModuleLinks() {
  return (
    <>
      {MODULES.filter((m) => m.key !== "reports").map((m) => (
        <NavItem key={m.key} href={m.href} icon={m.key} label={m.label} />
      ))}
      <NavItem href="/reports" icon="reports" label="Reports" />
    </>
  );
}

export function SettingsLink() {
  return <NavItem href="/settings" icon="settings" label="Settings" />;
}
