import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMenuCatalog, getStockMap } from "@/lib/purchaseList/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PurchaseListBuilder } from "@/components/kitchen/PurchaseListBuilder";

export default async function NewPurchaseListPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (accessibleIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const catalog = await getMenuCatalog(supabase, accessibleIds);
  const withMenus = companies.filter((c) => accessibleIds.includes(c.id) && catalog.some((m) => m.companyId === c.id));
  const stockEntries = await Promise.all(withMenus.map(async (c) => [c.id, [...(await getStockMap(supabase, c.id)).entries()]] as const));
  const stock = Object.fromEntries(
    stockEntries.map(([id, entries]) => [id, entries.map(([name, rec]) => [name, rec.quantity, rec.unit] as [string, number, string | null])]),
  );
  const { data: events } = await supabase
    .from("catering_events")
    .select("id, company_id, event_name, event_date, pax_count, customers(name)")
    .in("company_id", accessibleIds)
    .order("event_date", { ascending: false })
    .limit(200);

  const defaultCompanyId = requestedId && withMenus.some((c) => c.id === requestedId) ? requestedId : withMenus[0]?.id;

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <Link href={`/kitchen/purchase-lists${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Purchase Lists</Link>
        <h1 className="mt-1 text-[22px] font-extrabold text-text">New Purchase List</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Pick the menus and the pax. The ingredients are calculated from the real menu recipes and combined into one list.</p>
      </div>
      <div className="print:hidden"><KitchenSubNav /></div>
      {withMenus.length === 0 ? (
        <EmptyRow text="No menu or recipe data is available for your companies yet." />
      ) : (
        <PurchaseListBuilder
          companies={withMenus}
          defaultCompanyId={defaultCompanyId}
          catalog={catalog}
          stock={stock}
          events={(events ?? []).map((e) => ({ id: e.id, company_id: e.company_id, event_name: e.event_name, event_date: e.event_date, pax_count: e.pax_count, customer_name: e.customers?.name ?? null }))}
        />
      )}
    </div>
  );
}
