import { CompanySelector, CompanyQuickLinks } from "./CompanySelector";
import { MainDashboardLink, ModuleLinks, SettingsLink } from "./NavLinks";

type Company = { id: string; name: string; legal_name: string };

export function Sidebar({ companies }: { companies: Company[] }) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-navy-900 text-white print:hidden">
      <div className="flex items-center gap-2.5 border-b border-white/8 px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-[13px] font-extrabold">
          CM
        </div>
        <span className="text-[13.5px] font-bold">Central Mgmt System</span>
      </div>

      <CompanySelector companies={companies} />

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
        <MainDashboardLink />
        <CompanyQuickLinks companies={companies} />
        <div className="my-2 h-px bg-white/8" />
        <ModuleLinks />
      </nav>

      <div className="border-t border-white/8 p-3">
        <SettingsLink />
      </div>
    </aside>
  );
}
