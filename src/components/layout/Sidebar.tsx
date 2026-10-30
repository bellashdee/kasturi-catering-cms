"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CompanySelector, CompanyQuickLinks } from "./CompanySelector";
import { MainDashboardLink, ModuleLinks, ProfileLink, TopLinks, SettingsLink } from "./NavLinks";
import { useMobileNav } from "./MobileNavContext";

type Company = { id: string; name: string; legal_name: string };

export function Sidebar({ companies, allowedModules, badges, taskLinkLabel, showPayroll, scopedToOwnCompanies, userName, roleLabel }: { companies: Company[]; allowedModules: string[] | null; badges?: Record<string, number>; taskLinkLabel?: string; showPayroll?: boolean; scopedToOwnCompanies?: boolean; userName?: string; roleLabel?: string }) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  const router = useRouter();

  async function logOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

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
        <div className="flex items-center gap-3 border-b border-sidebar-line px-4 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-[15px] font-extrabold text-white shadow-sm">
            CM
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-extrabold uppercase leading-tight tracking-wide">Central Management System</div>
            <div className="mt-0.5 text-[10.5px] leading-snug text-sidebar-text/75">Centralized Catering, Kitchen, Finance &amp; HR System</div>
          </div>
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
          {userName && (
            <div className="mt-3 flex items-end justify-between gap-2 px-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide">
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                    <rect x="4" y="9" width="12" height="8" rx="2" />
                    <path d="M7 9V6.5a3 3 0 016 0V9" />
                  </svg>
                  <span className="truncate">{userName}</span>
                </div>
                {roleLabel && <div className="mt-0.5 pl-[19px] text-[11px] text-sidebar-text/75">{roleLabel}</div>}
              </div>
              <button type="button" onClick={logOut} className="shrink-0 rounded-lg bg-sidebar-active px-3 py-1.5 text-[12px] font-bold text-sidebar-active-text shadow-sm hover:opacity-90">
                Log Out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
