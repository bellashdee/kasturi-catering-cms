import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSupplierNotes } from "@/lib/procurement/queries";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { natural, readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Date", note: "Note No.", supplier: "Supplier", invoice: "Invoice No.", amount: "Amount" };

export default async function SupplierNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; type?: string; supplier?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const sp = await searchParams;
  const { company: requestedId, month, type, supplier } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  const sep = requestedId ? "&" : "?";

  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  // by month: the date of the note
  const inMonth = filterByMonth(await listSupplierNotes(supabase, targetCompanyIds), month, (n) => n.note_date);
  const supplierOptions = Array.from(new Map(inMonth.filter((n) => n.supplier_id).map((n) => [n.supplier_id as string, n.suppliers?.name ?? "—"])).entries()).sort((a, b) => natural(a[1], b[1]));
  const notes = sortBy(
    inMonth.filter((n) => (!type || n.note_type === type) && (!supplier || n.supplier_id === supplier)),
    sort,
    dir,
    {
      date: (n) => n.note_date,
      note: (n) => n.note_number,
      supplier: [(n) => n.suppliers?.name, (n) => n.note_date],
      invoice: [(n) => n.supplier_invoices?.invoice_number, (n) => n.note_date],
      amount: (n) => Number(n.amount),
    },
  );
  const filtered = !!(type || supplier);
  const monthLabel = monthLabelOf(month);
  const credit = notes.filter((n) => n.note_type === "credit").reduce((t, n) => t + Number(n.amount), 0);
  const debit = notes.filter((n) => n.note_type === "debit").reduce((t, n) => t + Number(n.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {notes.length} note{notes.length === 1 ? "" : "s"} · credit {formatCurrency(credit)} · debit {formatCurrency(debit)}
            {monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/supplier-procurement/notes/new${query}${sep}type=debit`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            + Debit Note
          </Link>
          <Link href={`/supplier-procurement/notes/new${query}${sep}type=credit`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + Credit Note
          </Link>
        </div>
      </div>

      <SupplierProcurementSubNav />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/supplier-procurement/notes${query}`}>
        <FilterField label="Type">
          <Select name="type" defaultValue={type ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All types</option>
            <option value="credit">Credit note</option>
            <option value="debit">Debit note</option>
          </Select>
        </FilterField>
        <FilterField label="Supplier">
          <Select name="supplier" defaultValue={supplier ?? ""} className={`${FILTER_INPUT} w-64`}>
            <option value="">All suppliers</option>
            {supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      {notes.length === 0 ? (
        <EmptyRow text={filtered ? "No credit or debit notes match these filters." : monthLabel ? "No credit or debit notes in this month." : "No credit or debit notes yet. A credit note lowers what you owe a supplier (returned goods, wrong price); a debit note raises it (extra charge)."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">Type</th>
                <th className="px-3 py-3">Note No.</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">Invoice</th>
                <th className="px-5 py-3 text-right">Amount (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {notes.map((n) => (
                <tr key={n.id}>
                  <td className="px-5 py-3">
                    <StatusBadge tone={n.note_type === "credit" ? "success" : "warning"}>{n.note_type === "credit" ? "Credit" : "Debit"}</StatusBadge>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/supplier-procurement/notes/${n.id}${query}`} className="font-semibold text-text hover:underline">
                      {n.note_number}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{formatMalaysiaDate(n.note_date)}</td>
                  <td className="px-3 py-3 text-text">{n.suppliers?.name}</td>
                  <td className="px-3 py-3 text-text-secondary">{n.supplier_invoices?.invoice_number ?? "—"}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-text">{Number(n.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
