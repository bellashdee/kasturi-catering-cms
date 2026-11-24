import Link from "next/link";

const TABS = [
  { href: "/profile", label: "My Details" },
  { href: "/profile/claim-hours", label: "Claim Hours" },
  { href: "/profile/mileage", label: "Mileage Claim" },
];

/** The tabs of My Profile. */
export function ProfileTabs({ active, record }: { active: string; record?: string }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border print:hidden">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={record ? `${t.href}?record=${record}` : t.href}
          className={`border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${active === t.href ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
