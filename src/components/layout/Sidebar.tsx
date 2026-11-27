"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOutOfDevice } from "@/lib/offline/signOut";
import { useI18n } from "@/components/i18n/I18nProvider";
import { CompanySelector, CompanyQuickLinks } from "./CompanySelector";
import { MainDashboardLink, ModuleLinks, ProfileLink, TopLinks, SettingsLink, SidebarCollapsedContext, labelClass } from "./NavLinks";
import { useMobileNav } from "./MobileNavContext";

type Company = { id: string; name: string; legal_name: string };

const COLLAPSED_KEY = "sidebar-collapsed";
const collapsedListeners = new Set<() => void>();
const subscribeCollapsed = (listener: () => void) => {
  collapsedListeners.add(listener);
  return () => void collapsedListeners.delete(listener);
};
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

export function Sidebar({ companies, allowedModules, badges, taskLinkLabel, showPayroll, scopedToOwnCompanies, userName, roleLabel, showDashboard = true }: { companies: Company[]; allowedModules: string[] | null; badges?: Record<string, number>; taskLinkLabel?: string; showPayroll?: boolean; scopedToOwnCompanies?: boolean; userName?: string; roleLabel?: string; showDashboard?: boolean }) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  // open = the words are shown; closed = only the logo and the icons (the choice is kept on this computer)
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  function toggle() {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      /* the browser does not keep it: the choice lasts until the page is reloaded */
    }
    collapsedListeners.forEach((l) => l());
  }

  async function logOut() {
    if (!(await signOutOfDevice(t))) return;
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

      <SidebarCollapsedContext.Provider value={collapsed}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-60 shrink-0 flex-col bg-sidebar text-sidebar-text transition-[transform,width] duration-200 ease-out print:hidden md:relative md:translate-x-0 ${
          collapsed ? "md:w-[76px]" : ""
        } ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Open the side menu" : "Close the side menu"}
          title={collapsed ? "Open the side menu" : "Close the side menu"}
          className="absolute -right-3 top-[30px] z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-line bg-sidebar text-sidebar-text shadow-md hover:opacity-90 md:flex"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={collapsed ? "rotate-180" : ""} aria-hidden="true">
            <path d="M12.5 4.5l-5 5.5 5 5.5" />
          </svg>
        </button>
        <div className={`flex items-center gap-3 border-b border-sidebar-line px-4 py-4 ${collapsed ? "md:justify-center md:px-0" : ""}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-[15px] font-extrabold text-white shadow-sm">
            CM
          </div>
          <div className={`min-w-0 ${labelClass(collapsed)}`}>
            <div className="text-[12.5px] font-extrabold uppercase leading-tight tracking-wide">Central Management System</div>
          </div>
        </div>

        <div className={labelClass(collapsed)}>
          <CompanySelector companies={companies} scopedToOwnCompanies={scopedToOwnCompanies} />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
          <ProfileLink />
          {showDashboard && <MainDashboardLink />}
          <TopLinks taskLabel={taskLinkLabel} />
          <CompanyQuickLinks companies={companies} />
          <div className="my-2 h-px bg-sidebar-line" />
          <ModuleLinks allowedModules={allowedModules} badges={badges} showPayroll={showPayroll} />
        </nav>

        <div className="border-t border-sidebar-line p-3">
          <SettingsLink />
          {userName && (
            <div className={`mt-3 flex items-end justify-between gap-2 px-1.5 ${collapsed ? "md:flex-col md:items-center md:gap-2 md:px-0" : ""}`}>
              <div className="min-w-0" title={userName}>
                <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide">
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                    <rect x="4" y="9" width="12" height="8" rx="2" />
                    <path d="M7 9V6.5a3 3 0 016 0V9" />
                  </svg>
                  <span className={`truncate ${labelClass(collapsed)}`}>{userName}</span>
                </div>
                {roleLabel && <div className={`mt-0.5 pl-[19px] text-[11px] text-sidebar-text/75 ${labelClass(collapsed)}`}>{roleLabel}</div>}
              </div>
              <button type="button" onClick={logOut} title="Log Out" className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sidebar-active px-3 py-1.5 text-[12px] font-bold text-sidebar-active-text shadow-sm hover:opacity-90">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${collapsed ? "hidden md:block" : "hidden"}`} aria-hidden="true">
                  <path d="M8 4H5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 005 16h3M12.5 6.5L16 10l-3.5 3.5M16 10H8" />
                </svg>
                <span className={labelClass(collapsed)}>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </aside>
      </SidebarCollapsedContext.Provider>
    </>
  );
}
