"use client";

import { usePathname } from "next/navigation";
import { ALL_COMPANIES_OPTION, COMPANY_STYLE, MODULES } from "@/lib/constants";
import { RESTAURANT_MODULE_LABEL } from "@/lib/restaurantView";
import { useRestaurantView } from "@/components/layout/RestaurantView";
import { useViewedCompanyId } from "@/components/layout/CompanyTheme";

type Company = { id: string; name: string; legal_name: string };

function pageTitle(pathname: string, priorityTitle: string, restaurant: boolean): string {
  if (pathname === "/") return "Main Dashboard";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/profile")) return "My Profile";
  if (pathname.startsWith("/priority-centre")) return priorityTitle;
  if (pathname.startsWith("/payroll-centre")) return "Payroll Centre";
  if (pathname.startsWith("/bulletin")) return "Bulletin Board";
  if (pathname.startsWith("/signature-dashboard")) return "Signature Solution Dashboard";
  const found = MODULES.find((m) => [m.href, ...(m.matchPrefixes ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return (restaurant && found ? RESTAURANT_MODULE_LABEL[found.key] : undefined) ?? found?.label ?? "Central Management System";
}

/** The company being viewed (a coloured badge with its initials plus its name) and the current module's title. */
export function HeaderTitle({ companies, priorityTitle = "Priority Centre" }: { companies: Company[]; priorityTitle?: string }) {
  const pathname = usePathname();
  const restaurant = useRestaurantView();
  const selectedId = useViewedCompanyId();
  const company = companies.find((c) => c.id === selectedId);
  const name = company?.name ?? ALL_COMPANIES_OPTION.name;
  const style = company ? COMPANY_STYLE[company.legal_name] : undefined;
  const colour = style?.colorVar ?? ALL_COMPANIES_OPTION.colorVar;
  const short = style?.short ?? (company ? company.name.slice(0, 2).toUpperCase() : ALL_COMPANIES_OPTION.short);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-extrabold text-white lg:flex" style={{ background: colour }} aria-hidden="true">
        {short}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[12.5px] font-semibold uppercase tracking-wide text-text-secondary">{name}</div>
        <div className="truncate text-[17px] font-extrabold text-text sm:text-[19px]">{pageTitle(pathname, priorityTitle, restaurant)}</div>
      </div>
    </div>
  );
}
