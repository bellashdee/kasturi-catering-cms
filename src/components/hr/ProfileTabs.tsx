import Link from "next/link";

const TABS = [
  { href: "/profile", label: "My Details" },
  { href: "/profile/leave", label: "Leave Form" },
  { href: "/profile/ot", label: "OT Form" },
  { href: "/profile/claim-hours", label: "Claim Hours" },
  { href: "/profile/mileage", label: "Mileage Claim" },
];

/** The tabs of My Profile. */
export function ProfileTabs({ active, record }: { active: string; record?: string }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 print:hidden">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={record ? `${t.href}?record=${record}` : t.href}
          className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-[14px] font-semibold ${active === t.href ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
