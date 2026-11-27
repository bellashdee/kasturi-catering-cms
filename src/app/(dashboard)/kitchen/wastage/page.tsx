import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { listWastage, restaurantOf } from "@/lib/kitchen/wastageQueries";
import { WASTAGE_REASONS } from "@/lib/kitchen/wastage";
import { isRestaurantScope } from "@/lib/restaurantView";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { WastageRowActions } from "@/components/kitchen/WastageRowActions";
import { QueuedChanges } from "@/components/offline/QueuedChanges";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ExportButtons } from "@/components/shared/ExportButtons";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Date", item: "Item", reason: "Reason", value: "Value" };

const qtyText = (q: number | string, unit: string | null) => `${Number(q)}${unit ? ` ${unit}` : ""}`;

/** The Wastage Log of the restaurant: food thrown away, for information only (it is not added to any cost). */
export default async function WastagePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; reason?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month = "", reason = "" } = sp;
  const q = (sp.q ?? "").trim();
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const restaurant = isRestaurantScope(companies, targetCompanyIds);
  const o2 = restaurantOf(companies, targetCompanyIds);
  const title = restaurant ? "Kitchen & Stock" : "Kitchen";
  if (!o2) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-[22px] font-extrabold text-text">{title}</h1>
        <KitchenSubNav />
        <EmptyRow text="The Wastage Log is for the restaurant (O2 Life). Choose O2 Life in the company selector at the top. The catering companies record wastage in Kitchen → Stock (Adjust Stock → Wastage)." />
      </div>
    );
  }

  const monthLabel = monthLabelOf(month);
  const all = await listWastage(supabase, targetCompanyIds, monthRange(month));
  const words = q.toUpperCase().split(/\s+/).filter(Boolean);
  const matching = all.filter((r) => (!reason || r.reason === reason) && words.every((w) => `${r.item} ${r.notes ?? ""}`.toUpperCase().includes(w)));
  const rows = sortBy(matching, sort, dir, {
    date: [(r) => r.wasted_on, (r) => r.created_at],
    item: [(r) => r.item, (r) => r.wasted_on],
    reason: [(r) => r.reason, (r) => r.wasted_on],
    value: [(r) => (r.estimated_value === null ? null : Number(r.estimated_value)), (r) => r.wasted_on],
  });

  const showCompany = targetCompanyIds.length > 1;
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const admins = new Set(await adminCompanyIds(supabase, [...new Set(rows.map((r) => r.company_id))]));
  const canChange = (r: (typeof rows)[number]) => r.created_by === session.userId || admins.has(r.company_id);

  // the totals of the list as shown
  const totalValue = rows.reduce((t, r) => t + Number(r.estimated_value ?? 0), 0);
  const byReason = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const cur = byReason.get(r.reason) ?? { count: 0, value: 0 };
    byReason.set(r.reason, { count: cur.count + 1, value: cur.value + Number(r.estimated_value ?? 0) });
  }
  const biggest = [...byReason.entries()].sort((a, b) => b[1].value - a[1].value || b[1].count - a[1].count)[0];
  const withoutValue = rows.filter((r) => r.estimated_value === null).length;
  const entriesWord = (n: number) => `entr${n === 1 ? "y" : "ies"}`;

  const filtered = !!(q || reason);
  const keep = { company: requestedId, month: monthLabel ? month : "" };
  const clearHref = `/kitchen/wastage${query}${monthLabel ? `${query ? "&" : "?"}month=${month}` : ""}`;
  const exportTable = {
    title: "Wastage Log",
    subtitle: `${o2.name}${monthLabel ? ` - ${monthLabel}` : ""}${reason ? ` - ${reason}` : ""}${q ? ` - "${q}"` : ""} - ${rows.length} ${entriesWord(rows.length)} (information only, not added to costs)`,
    moneyColumns: ["Estimated Value (RM)"],
    columns: ["Date", ...(showCompany ? ["Company"] : []), "Item", "Quantity", "Reason", "Estimated Value (RM)", "Notes"],
    rows: rows.map((r) => [
      r.wasted_on,
      ...(showCompany ? [companyName.get(r.company_id) ?? ""] : []),
      r.item,
      qtyText(r.quantity, r.unit),
      r.reason,
      r.estimated_value === null ? "" : Number(r.estimated_value).toFixed(2),
      r.notes ?? "",
    ]),
    summary: [
      { label: "Entries", value: String(rows.length) },
      { label: "Total estimated value", value: formatCurrency(totalValue), bold: true },
    ],
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">{title}</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Wastage Log{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons table={exportTable} />
          <Link href={`/kitchen/wastage/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Wastage Entry
          </Link>
        </div>
      </div>

      <KitchenSubNav />
      <QueuedChanges ops={["wastage.create", "wastage.update", "wastage.delete"]} />
      <MonthFilter />

      <ListFilters keep={keep} sortOptions={SORTS} sort={sort} dir={dir} clearHref={clearHref}>
        <FilterField label="Search item">
          <input name="q" defaultValue={q} placeholder="Item or notes…" className={`${FILTER_INPUT} w-56`} />
        </FilterField>
        <FilterField label="Reason">
          <Select name="reason" defaultValue={reason} className={`${FILTER_INPUT} w-56`}>
            <option value="">All reasons</option>
            {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">Entries</div>
          <div className="mt-1 text-[20px] font-extrabold text-text">{rows.length}</div>
          {filtered && <div className="text-[12px] text-text-secondary">{`of ${all.length} listed`}</div>}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">Total estimated value</div>
          <div className="mt-1 text-[20px] font-extrabold text-text">{formatCurrency(totalValue)}</div>
          <div className="text-[12px] text-text-secondary">{withoutValue > 0 ? `${withoutValue} ${entriesWord(withoutValue)} without a value` : "Information only, not added to costs"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-secondary">Biggest reason</div>
          <div className="mt-1 text-[20px] font-extrabold text-text">{biggest ? biggest[0] : "—"}</div>
          <div className="text-[12px] text-text-secondary">{biggest ? `${formatCurrency(biggest[1].value)} · ${biggest[1].count} ${entriesWord(biggest[1].count)}` : "No entries"}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <EmptyRow text={filtered ? "No entry matches the search. Change the words or the filters." : monthLabel ? "No wastage recorded in this month." : "No wastage recorded yet."} />
        ) : (
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-border text-left text-[12.5px] font-bold text-text-secondary">
                <th className="px-4 py-2.5">Date</th>
                {showCompany && <th className="px-3 py-2.5">Company</th>}
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5 text-right">Quantity</th>
                <th className="px-3 py-2.5">Reason</th>
                <th className="px-3 py-2.5 text-right">Estimated value (RM)</th>
                <th className="px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5">Photo</th>
                <th className="px-4 py-2.5 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text">{formatMalaysiaDate(`${r.wasted_on}T12:00:00+08:00`)}</td>
                  {showCompany && <td className="px-3 py-2.5 text-text-secondary">{companyName.get(r.company_id)}</td>}
                  <td className="px-3 py-2.5 font-semibold text-text">{r.item}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text">{qtyText(r.quantity, r.unit)}</td>
                  <td className="px-3 py-2.5 text-text">{r.reason}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text">{r.estimated_value === null ? <span className="text-text-secondary">—</span> : formatCurrency(Number(r.estimated_value))}</td>
                  <td className="max-w-[260px] px-3 py-2.5 text-text-secondary">{r.notes ?? "—"}</td>
                  <td className="px-3 py-2.5">{r.document_id ? <DocumentViewLink documentId={r.document_id} label="📷 View" /> : <span className="text-text-secondary">—</span>}</td>
                  <td className="px-4 py-2.5 print:hidden">
                    {canChange(r) && <WastageRowActions id={r.id} item={r.item} editHref={`/kitchen/wastage/${r.id}/edit${query}`} companyId={r.company_id} updatedAt={r.updated_at} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[12.5px] text-text-secondary">The Wastage Log is for information only. It is not added to any cost: the food bought is already counted in Company Expenses.</p>
    </div>
  );
}
