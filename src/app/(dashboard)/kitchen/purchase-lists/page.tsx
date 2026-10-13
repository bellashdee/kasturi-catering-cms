import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPurchaseLists } from "@/lib/purchaseList/queries";
import { MEAL_SESSION_LABEL, PURCHASE_ITEM_STATUSES, PURCHASE_ITEM_STATUS_LABEL } from "@/lib/purchaseList/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { sessionLabel } from "@/lib/purchaseList/sessions";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";

type Search = { company?: string; q?: string; menu?: string; status?: string; from?: string; to?: string; filterCompany?: string };

export default async function PurchaseListsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const query = sp.company ? `?company=${sp.company}` : "";

  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const all = await listPurchaseLists(supabase, targetCompanyIds);
  const q = sp.q?.trim().toLowerCase();
  const menuQ = sp.menu?.trim().toLowerCase();
  const lists = all.filter((l) => {
    if (sp.filterCompany && l.company_id !== sp.filterCompany) return false;
    if (q && !`${l.event_name} ${l.customer_name ?? ""}`.toLowerCase().includes(q)) return false;
    if (menuQ && !l.purchase_list_menus.some((m) => m.menu_label.toLowerCase().includes(menuQ))) return false;
    if (sp.status && !l.purchase_list_items.some((i) => i.status === sp.status)) return false;
    if (sp.from && (!l.event_date || l.event_date < sp.from)) return false;
    if (sp.to && (!l.event_date || l.event_date > sp.to)) return false;
    return true;
  });

  const field = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]";
  const label = "text-[12px] font-semibold text-text-secondary";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{lists.length} purchase list{lists.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/kitchen/purchase-lists/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Purchase List
        </Link>
      </div>

      <KitchenSubNav />

      <form method="get" className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        <div>
          <label className={label}>Company</label>
          <select name="filterCompany" defaultValue={sp.filterCompany ?? ""} className={field}>
            <option value="">All</option>
            {companies.filter((c) => targetCompanyIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Event / customer</label>
          <input name="q" defaultValue={sp.q ?? ""} className={field} placeholder="Event name" />
        </div>
        <div>
          <label className={label}>Menu</label>
          <input name="menu" defaultValue={sp.menu ?? ""} className={field} placeholder="Menu name" />
        </div>
        <div>
          <label className={label}>Item status</label>
          <select name="status" defaultValue={sp.status ?? ""} className={field}>
            <option value="">All</option>
            {PURCHASE_ITEM_STATUSES.map((s) => <option key={s} value={s}>{PURCHASE_ITEM_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Event date from</label>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={field} />
        </div>
        <div>
          <label className={label}>to</label>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={field} />
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Filter</button>
      </form>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {lists.length === 0 ? (
          <EmptyRow text={all.length === 0 ? "No purchase lists yet. Create one from the menus." : "No purchase list matches the filters."} />
        ) : (
          <div className="divide-y divide-border">
            {lists.map((l) => {
              const counts = Object.fromEntries(PURCHASE_ITEM_STATUSES.map((s) => [s, l.purchase_list_items.filter((i) => i.status === s).length]));
              const total = l.purchase_list_items.length;
              return (
                <Link key={l.id} href={`/kitchen/purchase-lists/${l.id}${query}`} className="flex flex-col gap-1 px-5 py-3.5 hover:bg-surface-alt sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-text">{l.event_name}</div>
                    <div className="text-xs text-text-muted">
                      {l.companies?.name}
                      {l.menu_category ? ` · ${l.menu_category}${l.week_numbers.length ? ` Week ${l.week_numbers.join(", ")}` : ""}${l.meal_sessions.length ? ` · ${l.meal_sessions.map(sessionLabel).join(", ")}` : ""}` : l.meal_session ? ` · ${MEAL_SESSION_LABEL[l.meal_session]}` : ""}
                      {" · "}{l.event_date ?? "no date"} · {l.required_pax} pax · {l.purchase_list_menus.length} dish(es)
                      {l.customer_name ? ` · ${l.customer_name}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary">
                    {total} item(s) — {PURCHASE_ITEM_STATUSES.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${PURCHASE_ITEM_STATUS_LABEL[s].toLowerCase()}`).join(", ")}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
