import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getPurchaseList } from "@/lib/purchaseList/queries";
import { MEAL_SESSION_LABEL, PURCHASE_ITEM_STATUSES, PURCHASE_ITEM_STATUS_LABEL } from "@/lib/purchaseList/constants";
import { sessionLabel } from "@/lib/purchaseList/sessions";
import { formatQty } from "@/lib/purchaseList/calc";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PurchaseListItemsTable, PurchaseListToolbar, type ItemRow } from "@/components/kitchen/PurchaseListItemsTable";
import { PurchaseListOrderPanel, type SupplierGroup } from "@/components/kitchen/PurchaseListOrderPanel";
import { supplierKey } from "@/lib/purchaseList/suppliers";

export default async function PurchaseListDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const { company } = await searchParams;
  const query = company ? `?company=${company}` : "";

  const supabase = await createClient();
  let list;
  try {
    list = await getPurchaseList(supabase, id);
  } catch {
    notFound();
  }

  const items: ItemRow[] = [...list.purchase_list_items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      id: i.id,
      ingredient_name: i.ingredient_name,
      unit: i.unit,
      calculated_quantity: i.calculated_quantity === null ? null : Number(i.calculated_quantity),
      final_quantity: i.final_quantity === null ? null : Number(i.final_quantity),
      rounding_note: i.rounding_note,
      stock_status: i.stock_status,
      stock_available: i.stock_available === null ? null : Number(i.stock_available),
      supplier: i.supplier,
      remark: i.remark,
      status: i.status,
      flags: i.flags ?? [],
      breakdown: (i.breakdown as unknown as ItemRow["breakdown"]) ?? [],
    }));
  // the lines grouped by supplier, and which purchase order each line already has
  const [{ data: companySuppliers }, { data: linkedOrders }] = await Promise.all([
    supabase.from("suppliers").select("name").eq("company_id", list.company_id),
    supabase.from("purchase_orders").select("id, po_number").in("id", list.purchase_list_items.map((i) => i.purchase_order_id).filter((x): x is string => !!x)),
  ]);
  const knownSuppliers = new Set((companySuppliers ?? []).map((s) => supplierKey(s.name)));
  const poById = new Map((linkedOrders ?? []).map((o) => [o.id, o.po_number]));
  const groupMap = new Map<string, SupplierGroup>();
  for (const i of [...list.purchase_list_items].sort((a, b) => a.sort_order - b.sort_order)) {
    const name = i.supplier?.trim() ?? "";
    const key = supplierKey(name);
    const g = groupMap.get(key) ?? { supplier: name, known: !!name && knownSuppliers.has(key), lines: [] };
    g.lines.push({ id: i.id, name: i.ingredient_name, quantity: i.final_quantity === null ? null : Number(i.final_quantity), unit: i.unit, poId: i.purchase_order_id, poNumber: i.purchase_order_id ? poById.get(i.purchase_order_id) ?? null : null });
    groupMap.set(key, g);
  }
  const supplierGroups = [...groupMap.values()].sort((a, b) => (a.supplier === "" ? 1 : b.supplier === "" ? -1 : a.supplier.localeCompare(b.supplier)));

  const menus = [...list.purchase_list_menus].sort((a, b) => a.sort_order - b.sort_order);
  // the same breakdown grouped by dish (rebuilt from the stored per-ingredient breakdown)
  const dishMap = new Map<string, { dish: string; lines: { ingredient: string; baseQuantity: number | null; basePax: number; quantity: number | null; unit: string | null; remark: string | null }[] }>();
  for (const it of items) {
    for (const b of it.breakdown) {
      const entry = dishMap.get(b.menuLabel) ?? { dish: b.menuLabel, lines: [] };
      entry.lines.push({ ingredient: it.ingredient_name, baseQuantity: b.baseQuantity, basePax: b.basePax, quantity: b.quantity, unit: b.unit, remark: (b as { remark?: string | null }).remark ?? null });
      dishMap.set(b.menuLabel, entry);
    }
  }
  const byDish = [...dishMap.values()];
  const counts = Object.fromEntries(PURCHASE_ITEM_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length]));

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <Link href={`/kitchen/purchase-lists${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Purchase Lists</Link>
      </div>
      <div className="print:hidden"><KitchenSubNav /></div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Purchase List · {list.companies?.name}</div>
          <h1 className="mt-0.5 text-[22px] font-extrabold text-text">{list.event_name}</h1>
          {list.menu_category && (
            <div className="mt-0.5 text-[13px] font-semibold text-text">
              {list.menu_category}
              {list.week_numbers.length > 0 ? ` · Week ${list.week_numbers.join(", ")}` : ""}
              {list.meal_sessions.length > 0 ? ` · ${list.meal_sessions.map(sessionLabel).join(", ")}` : ""}
            </div>
          )}
          <div className="text-[13px] text-text-secondary">
            {list.customer_name ? `${list.customer_name} · ` : ""}
            {list.event_date ?? "no date"}
            {list.meal_session ? ` · ${MEAL_SESSION_LABEL[list.meal_session]}` : ""} · <b>{list.required_pax} pax</b>
          </div>
          {list.notes && <div className="mt-1 text-[13px] text-text-secondary">Notes: {list.notes}</div>}
        </div>
        <PurchaseListToolbar listId={id} exportHref={`/kitchen/purchase-lists/${id}/export`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Menus ({menus.length})</div>
        <div className="flex flex-col gap-0.5 text-text-secondary">
          {menus.map((m) => <div key={m.id}><span className="font-semibold text-text">{m.menu_label}</span>{m.group_label ? ` — ${m.group_label}` : ""}</div>)}
        </div>
      </div>

      <div className="text-[13px] text-text-secondary print:hidden">
        {items.length} ingredient(s) — {PURCHASE_ITEM_STATUSES.map((s) => `${counts[s]} ${PURCHASE_ITEM_STATUS_LABEL[s].toLowerCase()}`).join(" · ")}
      </div>

      <PurchaseListOrderPanel listId={id} groups={supplierGroups} canOrder={items.length > 0} query={query} />

      <PurchaseListItemsTable items={items} />

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[15px] font-bold text-text">Ingredient breakdown by dish — {list.required_pax} pax</div>
          <span className="text-xs text-text-muted print:hidden">Shown when printing too</span>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-surface-alt">
              <tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                <th className="px-3 py-2">Dish</th>
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2">Original qty</th>
                <th className="px-3 py-2">Original pax</th>
                <th className="px-3 py-2">Required qty</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {byDish.map((d) =>
                d.lines.map((l, i) => (
                  <tr key={`${d.dish}-${i}`} className="border-t border-border text-[12.5px]">
                    <td className="px-3 py-1.5 font-semibold text-text">{i === 0 ? d.dish : ""}</td>
                    <td className="px-3 py-1.5 text-text">{l.ingredient}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{l.baseQuantity === null ? "—" : formatQty(l.baseQuantity, 3)}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{l.basePax}</td>
                    <td className="px-3 py-1.5 font-semibold text-text">{l.quantity === null ? <span className="text-warning">blank — confirm</span> : formatQty(l.quantity, 3)}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{l.unit ?? "—"}</td>
                    <td className="px-3 py-1.5 text-text-muted">{l.remark ?? ""}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-text-muted print:hidden">
        &quot;Calculated&quot; is fixed by the menu recipes for {list.required_pax} pax. &quot;Buy&quot; can be changed without changing any recipe. Saving this list does not deduct stock or create a purchase order.
      </p>
    </div>
  );
}
