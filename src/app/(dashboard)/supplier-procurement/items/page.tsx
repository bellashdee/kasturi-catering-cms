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
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayLabel = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);
/** "All purchase lines": the lines themselves */
const LINE_SORTS = { date: "Date", invoice: "Invoice No.", supplier: "Supplier", item: "Item", amount: "Amount" };
/** "By supplier": the suppliers by name, or the items inside each supplier */
const SUPPLIER_SORTS = { supplier: "Supplier", item: "Item", date: "Latest date", price: "Latest price" };

/**
 * What every supplier sold and at what price per unit, worked out from the purchase invoice lines
 * (by supplier: item, unit of measure, latest price; or line by line: item, quantity, unit of measure, price, supplier).
 */
export default async function SupplierItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; view?: string; supplier?: string; q?: string; from?: string; to?: string; month?: string; sort?: string; dir?: string }>;
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
  const fromInput = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const toInput = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  // by month: the invoice date of the purchase line; a From / To typed as well narrows it further
  const range = monthRange(sp.month);
  const monthLabel = monthLabelOf(sp.month);
  const from = range && (!fromInput || fromInput < range.start) ? range.start : fromInput;
  const to = range && (!toInput || toInput > range.end) ? range.end : toInput;
  const supplierQ = (sp.supplier ?? "").trim().toLowerCase();
  const itemQ = (sp.q ?? "").trim().toLowerCase();

  const all = await listPurchaseLines(supabase, targetCompanyIds, { from, to });
  const filtered = all.filter(
    (l) =>
      (!supplierQ || l.supplierName.toLowerCase().includes(supplierQ)) &&
      (!itemQ || l.description.toLowerCase().includes(itemQ) || (l.itemCode ?? "").toLowerCase().includes(itemQ)),
  );

  const lineSort = readSort(sp, LINE_SORTS, "date", "desc");
  const supplierSort = readSort(sp, SUPPLIER_SORTS, "supplier", "asc");
  const { sort, dir } = view === "lines" ? lineSort : supplierSort;
  const lines = sortBy(filtered, lineSort.sort, lineSort.dir, {
    date: (l) => l.docDate,
    invoice: [(l) => l.docNo, (l) => l.docDate],
    supplier: [(l) => l.supplierName, (l) => l.docDate],
    item: [(l) => l.description, (l) => l.docDate],
    amount: (l) => l.amount,
  });

  // by supplier: the suppliers A–Z (or Z–A when sorted by supplier), each one's items in the chosen order
  const summary = summariseSupplierItems(filtered);
  const suppliers = sortBy(summary, "supplier", supplierSort.sort === "supplier" ? supplierSort.dir : "asc", { supplier: (s) => s.name }).map((s) =>
    supplierSort.sort === "supplier"
      ? s
      : {
          ...s,
          items: sortBy(s.items, supplierSort.sort, supplierSort.dir, {
            item: (i) => i.description,
            date: [(i) => i.latestDate, (i) => i.description],
            price: [(i) => i.latestPrice, (i) => i.description],
          }),
        },
  );
  const itemCount = suppliers.reduce((t, s) => t + s.items.length, 0);
  const total = lines.reduce((t, l) => t + l.amount, 0);

  const query = new URLSearchParams();
  if (sp.company) query.set("company", sp.company);
  for (const [k, v] of Object.entries({ supplier: sp.supplier, q: sp.q, from: fromInput, to: toInput, month: range ? sp.month : undefined, sort: sp.sort, dir: sp.dir })) if (v) query.set(k, v);
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
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Items each supplier sold and the price per unit, from the purchase invoices
          {monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
        </p>
      </div>

      <SupplierProcurementSubNav />

      <MonthFilter />

      <ListFilters
        keep={{ company: sp.company, month: range ? sp.month : undefined, view }}
        sortOptions={view === "lines" ? LINE_SORTS : SUPPLIER_SORTS}
        sort={sort}
        dir={dir}
        clearHref={`/supplier-procurement/items?view=${view}${sp.company ? `&company=${sp.company}` : ""}`}
      >
        <FilterField label="Supplier">
          <input name="supplier" defaultValue={sp.supplier ?? ""} placeholder="Supplier name" className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Item">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Item name or code" className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="From">
          <input type="date" name="from" defaultValue={fromInput ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={toInput ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
      </ListFilters>

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
        <EmptyRow text={monthLabel ? "No purchase lines in this month." : "No purchase invoice lines yet."} />
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
