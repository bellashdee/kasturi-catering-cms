"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type StaffKind = "local" | "foreign" | "none";
type Option = { value: string; label: string; count: number };

/**
 * Settings → Team Members: show only one company's group (or the people who can open every company) and only local staff, foreign staff
 * or logins with no staff record, sorted by date added, name or staff type. The choice is kept in the address, so a refresh keeps it.
 */
export function TeamMemberFilters({ companies, kinds, team, sort }: { companies: Option[]; kinds: Option[]; team: string; sort: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const hrefWith = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const chip = (key: string, o: Option, active: boolean) => (
    <Link
      key={`${key}-${o.value}`}
      href={hrefWith(key, o.value)}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text-secondary hover:text-text"}`}
    >
      {o.label} <span className={active ? "text-white/80" : "text-text-muted"}>({o.count})</span>
    </Link>
  );
  const staff = params.get("staff") ?? "";
  return (
    <div className="mb-3 flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-text-muted">Company</span>
        {companies.map((o) => chip("team", o, team === o.value))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-text-muted">Staff</span>
        {kinds.map((o) => chip("staff", o, staff === o.value))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-text-muted">Sort by</span>
        {[
          { value: "", label: "Date added" },
          { value: "name", label: "Name (A–Z)" },
          { value: "local", label: "Local staff first" },
          { value: "foreign", label: "Foreign staff first" },
        ].map((o) => (
          <Link
            key={o.value}
            href={hrefWith("sort", o.value)}
            scroll={false}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-semibold ${sort === o.value ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text-secondary hover:text-text"}`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
