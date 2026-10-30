"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CompanySelector, CompanyQuickLinks } from "./CompanySelector";
import { MainDashboardLink, ModuleLinks, ProfileLink, TopLinks, SettingsLink } from "./NavLinks";
import { useMobileNav } from "./MobileNavContext";

type Company = { id: string; name: string; legal_name: string };

export function Sidebar({ companies, allowedModules, badges, taskLinkLabel, showPayroll, scopedToOwnCompanies }: { companies: Company[]; allowedModules: string[] | null; badges?: Record<string, number>; taskLinkLabel?: string; showPayroll?: boolean; scopedToOwnCompanies?: boolean }) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <>
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-60 shrink-0 flex-col bg-sidebar text-sidebar-text transition-transform duration-200 ease-out print:hidden md:relative md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-line px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-[13px] font-extrabold text-white">
            CM
          </div>
          <span className="text-[13.5px] font-bold">Central Mgmt System</span>
        </div>

        <CompanySelector companies={companies} scopedToOwnCompanies={scopedToOwnCompanies} />

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
          <ProfileLink />
          <MainDashboardLink />
          <TopLinks taskLabel={taskLinkLabel} />
          <CompanyQuickLinks companies={companies} />
          <div className="my-2 h-px bg-sidebar-line" />
          <ModuleLinks allowedModules={allowedModules} badges={badges} showPayroll={showPayroll} />
        </nav>

        <div className="border-t border-sidebar-line p-3">
          <SettingsLink />
        </div>
      </aside>
    </>
  );
}
