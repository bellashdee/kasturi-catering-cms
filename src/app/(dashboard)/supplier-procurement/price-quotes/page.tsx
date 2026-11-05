import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatMalaysiaDate, formatPrice } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SearchBox } from "@/components/SearchBox";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SupplierPriceForm } from "@/components/kitchenPurchase/SupplierPriceForm";
import { listSuppliersFor } from "@/lib/kitchenPurchase/queries";
import { untyped } from "@/lib/kitchenPurchase/shared";

type Quote = { id: string; supplier_id: string; item_key: string; item_name: string; unit: string; price_per_unit: number; note: string | null; quoted_on: string; created_at: string; suppliers: { name: string } | null };

/**
 * Supplier Price Database: the prices suppliers have offered, item by item. The newest offer of each supplier is shown for comparison.
 * Older offers stay in the history; none of them is a confirmed quotation, so enter today's price when you buy.
 */
export default async function SupplierQuotesPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const db = untyped(supabase);
  let query = db.from("supplier_price_quotes").select("id, supplier_id, item_key, item_name, unit, price_per_unit, note, quoted_on, created_at, suppliers(name)").in("company_id", targetCompanyIds).order("created_at", { ascending: false }).limit(3000);
  if (q?.trim()) query = query.ilike("item_name", `%${q.trim().replace(/[%_]/g, " ")}%`);
  const { data, error } = await query;
  if (error) throw error;
  const quotes = (data ?? []) as unknown as Quote[];
  const suppliers = await listSuppliersFor(supabase, targetCompanyIds);

  // item -> supplier -> offers (newest first)
  const byItem = new Map<string, { name: string; unit: string; bySupplier: Map<string, Quote[]> }>();
  for (const x of quotes) {
    const k = `${x.item_key}|${x.unit}`;
    const item = byItem.get(k) ?? { name: x.item_name, unit: x.unit, bySupplier: new Map() };
    item.bySupplier.set(x.supplier_id, [...(item.bySupplier.get(x.supplier_id) ?? []), x]);
    byItem.set(k, item);
  }
  const items = [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Supplier &amp; Procurement</h1>
      <SupplierProcurementSubNav />
      <div>
        <h2 className="text-[17px] font-extrabold text-text">Supplier Price Database</h2>
        <p className="text-[13px] text-text-secondary">The price each supplier offered for an item, newest first. Older prices are kept as history and are not confirmed quotations.</p>
      </div>
      <SupplierPriceForm suppliers={suppliers} />
      <SearchBox placeholder="Search an item..." />
      {items.length === 0 ? (
        <EmptyRow text="No supplier price yet. Prices entered in a purchase request, or here, appear in this list." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => {
            const latest = [...it.bySupplier.values()].map((offers) => offers[0]);
            const lowest = latest.length > 1 ? Math.min(...latest.map((l) => Number(l.price_per_unit))) : null;
            return (
              <li key={`${it.name}|${it.unit}`} className="rounded-xl border border-border bg-surface p-4">
                <div className="text-[15.5px] font-bold text-text">
                  {it.name} <span className="text-[12.5px] font-semibold text-text-muted">per {it.unit}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {latest.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-alt px-3 py-2 text-[13.5px]">
                      <span>
                        <b>{l.suppliers?.name ?? "Supplier"}</b> · {formatPrice(Number(l.price_per_unit))} <span className="text-text-muted">· offered {formatMalaysiaDate(l.quoted_on)}</span>
                        {lowest !== null && Number(l.price_per_unit) === lowest && <span className="ml-2 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success">Lowest</span>}
                        {l.note && <span className="text-text-muted"> · {l.note}</span>}
                      </span>
                      {(it.bySupplier.get(l.supplier_id)?.length ?? 0) > 1 && (
                        <details className="text-[12.5px] text-text-secondary">
                          <summary className="cursor-pointer">History ({it.bySupplier.get(l.supplier_id)!.length})</summary>
                          <ul className="mt-1">
                            {it.bySupplier.get(l.supplier_id)!.map((h) => (
                              <li key={h.id}>
                                {formatMalaysiaDate(h.quoted_on)} · {formatPrice(Number(h.price_per_unit))}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
