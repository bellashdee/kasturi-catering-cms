import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { todayInMalaysia } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { MealsPaxTracker, type PaxRow } from "@/components/catering/MealsPaxTracker";
import { untyped } from "@/lib/kitchenPurchase/shared";

const DEFAULT_SITES = ["JDT 2", "JDT 3", "JDT 4", "UTM"];

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Catering → Meals & Pax: the daily number of people fed (breakfast, lunch, dinner, hi-tea) at the Signature Solution sites,
 * with a monthly summary and an Excel download. It is for Signature Solution Sdn Bhd only.
 */
export default async function MealsPaxPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId, month: requestedMonth } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const company = companies.find((c) => accessibleIds.includes(c.id) && /signature solution/i.test(c.name));

  const header = (
    <>
      <h1 className="text-[22px] font-extrabold text-text">Catering</h1>
      <CateringSubNav />
    </>
  );
  if (!company) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="Meals & Pax is for Signature Solution Sdn Bhd only. You do not have access to that company." />
      </div>
    );
  }

  const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : todayInMalaysia().slice(0, 7);
  const { data } = await untyped(supabase)
    .from("site_meal_pax")
    .select("site, pax_date, breakfast_pax, lunch_pax, dinner_pax, hitea_pax, remarks")
    .eq("company_id", company.id)
    .gte("pax_date", `${month}-01`)
    .lt("pax_date", `${shiftMonth(month, 1)}-01`)
    .limit(5000);
  type Db = { site: string; pax_date: string; breakfast_pax: number | null; lunch_pax: number | null; dinner_pax: number | null; hitea_pax: number | null; remarks: string | null };
  const rows: PaxRow[] = ((data ?? []) as Db[]).map((r) => ({ site: r.site, date: r.pax_date, breakfast: r.breakfast_pax, lunch: r.lunch_pax, dinner: r.dinner_pax, hitea: r.hitea_pax, remarks: r.remarks }));
  const sites = [...DEFAULT_SITES, ...Array.from(new Set(rows.map((r) => r.site))).filter((s) => !DEFAULT_SITES.includes(s))];
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const companyParam = requestedId ? `&company=${requestedId}` : "";
  const href = (m: string) => `/catering/meals-pax?month=${m}${companyParam}`;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[18px] font-extrabold text-text">Meals &amp; Pax</div>
          <div className="text-[13px] text-text-secondary">{company.name} · daily breakfast, lunch, dinner and hi-tea pax by site</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href={href(shiftMonth(month, -1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13.5px] font-semibold text-text" aria-label="Previous month">‹</Link>
          <div className="min-w-32 text-center text-[14px] font-semibold text-text">{monthLabel}</div>
          <Link href={href(shiftMonth(month, 1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13.5px] font-semibold text-text" aria-label="Next month">›</Link>
        </div>
      </div>
      <MealsPaxTracker key={month} companyId={company.id} companyName={company.name} month={month} monthLabel={monthLabel} sites={sites} initialRows={rows} />
    </div>
  );
}
