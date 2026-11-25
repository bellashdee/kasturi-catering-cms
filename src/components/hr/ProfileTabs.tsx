import Link from "next/link";

const TABS = [
  { href: "/profile", label: "My Details" },
  { href: "/profile/ot", label: "OT Form" },
  { href: "/profile/claim-hours", label: "Claim Hours" },
  { href: "/profile/leave", label: "Leave Form" },
  { href: "/profile/mileage", label: "Mileage Claim" },
];

/** The tabs of My Profile. A superior also gets Team Approvals (the OT and leave of their staff). */
export function ProfileTabs({ active, record, showTeam = false, teamWaiting = 0, showRoster = false }: { active: string; record?: string; showTeam?: boolean; teamWaiting?: number; showRoster?: boolean }) {
  const tabs = [
    ...TABS,
    ...(showRoster ? [{ href: "/profile/duty-roster", label: "Duty Roster" }] : []),
    ...(showTeam ? [{ href: "/profile/team", label: teamWaiting > 0 ? `Team Approvals (${teamWaiting})` : "Team Approvals" }] : []),
  ];
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 print:hidden">
      {tabs.map((t) => (
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
