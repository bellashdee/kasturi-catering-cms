import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatCurrency, formatMalaysiaDate, formatUnitPrice } from "@/lib/format";
import { listPurchaseLines, summariseSupplierItems, type PurchaseLine } from "@/lib/procurement/purchaseLines";
import { buildReportRows } from "@/lib/reports/buildRows";
import { ReportTable } from "@/components/reports/ReportTable";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { ExportListButtons } from "@/components/procurement/ExportListButtons";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayLabel = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);
const inputClass = "h-9 rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-primary";

/**
 * What every supplier sold and at what price per unit, worked out from the purchase invoice lines
 * (by supplier: item, unit of measure, latest price; or line by line: item, quantity, unit of measure, price, supplier).
 */
export default async function SupplierItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; view?: string; supplier?: string; q?: string; from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const view = sp.view === "lines" ? "lines" : "suppliers";
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  const supplierQ = (sp.supplier ?? "").trim().toLowerCase();
  const itemQ = (sp.q ?? "").trim().toLowerCase();

  const all = await listPurchaseLines(supabase, targetCompanyIds, { from, to });
  const lines = all.filter(
    (l) =>
      (!supplierQ || l.supplierName.toLowerCase().includes(supplierQ)) &&
      (!itemQ || l.description.toLowerCase().includes(itemQ) || (l.itemCode ?? "").toLowerCase().includes(itemQ)),
  );

  const suppliers = summariseSupplierItems(lines);
  const itemCount = suppliers.reduce((t, s) => t + s.items.length, 0);
  const total = lines.reduce((t, l) => t + l.amount, 0);

  const query = new URLSearchParams();
  if (sp.company) query.set("company", sp.company);
  for (const [k, v] of Object.entries({ supplier: sp.supplier, q: sp.q, from, to })) if (v) query.set(k, v);
  const viewHref = (v: string) => `/supplier-procurement/items?${new URLSearchParams({ ...Object.fromEntries(query), view: v }).toString()}`;
  const tab = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`;

  const supplierHeaders = ["Supplier", "Company", "Item Code", "Item", "UOM", "Latest Unit Price (RM)", "Latest Date", "Lowest (RM)", "Highest (RM)", "Times Bought", "Total Qty"];
  const supplierExport = suppliers.flatMap((s) =>
    s.items.map((i): (string | number)[] => [s.name, i.companies.join(" / "), i.itemCode ?? "", i.description, i.uom, i.latestPrice, i.latestDate, i.lowestPrice, i.highestPrice, i.timesBought, i.totalQuantity]),
  );

  const { headers, tableRows } = buildReportRows<PurchaseLine>(
    lines,
    [
      { key: "date", label: "Date", exportValue: (l) => l.docDate, display: (l) => dayLabel(l.docDate) },
      { key: "doc", label: "Invoice No.", exportValue: (l) => l.docNo },
      { key: "supplier", label: "Supplier", exportValue: (l) => l.supplierName },
      { key: "company", label: "Company", exportValue: (l) => l.companyName },
      { key: "code", label: "Item Code", exportValue: (l) => l.itemCode ?? "" },
      { key: "item", label: "Item", exportValue: (l) => l.description },
      { key: "uom", label: "UOM", exportValue: (l) => l.uom },
      { key: "qty", label: "Qty", exportValue: (l) => l.quantity },
      { key: "price", label: "Unit Price (RM)", exportValue: (l) => l.unitPrice, display: (l) => formatUnitPrice(l.unitPrice) },
      { key: "amount", label: "Amount (RM)", exportValue: (l) => l.amount, display: (l) => formatCurrency(l.amount) },
    ],
    (l) => l.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Items each supplier sold and the price per unit, from the purchase invoices</p>
      </div>

      <SupplierProcurementSubNav />

      <form method="get" className="flex flex-wrap items-end gap-3">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        <input type="hidden" name="view" value={view} />
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Supplier
          <input name="supplier" defaultValue={sp.supplier ?? ""} placeholder="Supplier name" className={`${inputClass} w-52`} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Item
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Item name or code" className={`${inputClass} w-52`} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          From
          <input type="date" name="from" defaultValue={from ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          To
          <input type="date" name="to" defaultValue={to ?? ""} className={inputClass} />
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">
          Filter
        </button>
        {(sp.supplier || sp.q || from || to) && (
          <Link href={`/supplier-procurement/items?view=${view}${sp.company ? `&company=${sp.company}` : ""}`} className="h-9 content-center text-[13px] font-semibold text-text-secondary hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <Link href={viewHref("suppliers")} className={tab(view === "suppliers")}>
            By supplier
          </Link>
          <Link href={viewHref("lines")} className={tab(view === "lines")}>
            All purchase lines
          </Link>
        </div>
        <div className="text-[12.5px] text-text-secondary">{`${suppliers.length} suppliers · ${itemCount} items · ${lines.length} lines · ${formatCurrency(total)}`}</div>
      </div>

      {all.length === 0 ? (
        <EmptyRow text="No purchase invoice lines yet." />
      ) : view === "lines" ? (
        <ReportTable headers={headers} rows={tableRows} filenameBase="purchase-lines" emptyText="No purchase lines for this filter." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <ExportListButtons filenameBase="supplier-items-and-prices" headers={supplierHeaders} rows={supplierExport} />
          </div>
          {suppliers.length === 0 && <EmptyRow text="No items for this filter." />}
          {suppliers.map((s) => (
            <details key={s.key} open={suppliers.length <= 2} className="group rounded-xl border border-border bg-surface shadow-sm">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                <span className="text-[15px] font-extrabold text-text">{s.name}</span>
                <span className="text-[12.5px] text-text-secondary">{`${s.companies.join(" / ")} · ${s.items.length} items`}</span>
              </summary>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-surface-alt">
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-4 py-2.5">Code</th>
                      <th className="px-4 py-2.5">UOM</th>
                      <th className="px-4 py-2.5 text-right">Latest price / unit</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5 text-right">Lowest – Highest</th>
                      <th className="px-4 py-2.5 text-right">Bought</th>
                      <th className="px-4 py-2.5 text-right">Total qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.key} className="border-t border-border text-[13px]">
                        <td className="px-4 py-2.5 font-semibold text-text">{i.description}</td>
                        <td className="px-4 py-2.5 text-text-muted">{i.itemCode ?? "—"}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{i.uom || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-text">{formatUnitPrice(i.latestPrice)}</td>
                        <td className="px-4 py-2.5 text-text-secondary">{dayLabel(i.latestDate)}</td>
                        <td className="px-4 py-2.5 text-right text-text-secondary">
                          {i.lowestPrice === i.highestPrice ? formatUnitPrice(i.lowestPrice) : `${formatUnitPrice(i.lowestPrice)} – ${formatUnitPrice(i.highestPrice)}`}
                        </td>
                        <td className="px-4 py-2.5 text-right text-text-secondary">{`${i.timesBought}×`}</td>
                        <td className="px-4 py-2.5 text-right text-text-secondary">{i.totalQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
