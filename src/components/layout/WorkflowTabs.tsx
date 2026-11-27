"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type WorkTab = { href: string; label: string; match: (p: string) => boolean };
/** A group of tabs: "steps" are the day's work in order and get a number (1, 2, 3 …); other groups (setup, records) have none. */
export type WorkGroup = { title: string; steps?: boolean; tabs: WorkTab[] };

/**
 * The tabs of a module laid out in the order of the work: the numbered steps first, then the setup / records groups, each under a small
 * title. Tabs the member may not open are left out before numbering, so the numbers never skip.
 */
export function WorkflowTabs({ groups, show }: { groups: WorkGroup[]; show: (tab: WorkTab) => boolean }) {
  const pathname = usePathname();
  const company = useSearchParams().get("company");
  let n = 0;
  const shown = groups.map((g) => ({ ...g, tabs: g.tabs.filter(show) })).filter((g) => g.tabs.length > 0);
  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border" aria-label="Pages of this module">
      {shown.map((group, gi) => (
        <div key={group.title} className={`min-w-0 ${gi > 0 ? "sm:border-l sm:border-border sm:pl-6" : ""}`}>
          <div className="px-3 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-text-muted">{group.title}</div>
          <div className="flex flex-wrap gap-0.5">
            {group.tabs.map((tab) => {
              const active = tab.match(pathname);
              const step = group.steps ? ++n : null;
              return (
                <Link
                  key={tab.href}
                  href={company ? `${tab.href}?company=${company}` : tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] font-semibold ${active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
                >
                  {step !== null && (
                    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-extrabold ${active ? "bg-primary text-white" : "bg-surface-alt text-text-secondary"}`}>{step}</span>
                  )}
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
