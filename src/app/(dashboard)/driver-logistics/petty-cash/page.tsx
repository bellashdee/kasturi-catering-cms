import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatPrice, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { ENTRY_TYPE_LABEL, type EntryType, type OperationPettyCashRow } from "@/lib/operationPettyCash/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ExportListButtons } from "@/components/procurement/ExportListButtons";
import { OperationPettyCashForm } from "@/components/operationPettyCash/OperationPettyCashForm";
import { OperationPettyCashRowActions } from "@/components/operationPettyCash/OperationPettyCashRowActions";
import { UndoBanner } from "@/components/operationPettyCash/UndoBanner";

const MONTH_RE = /^\d{4}-\d{2}$/;
const dayLabel = (iso: string) => formatMalaysiaDate(`${iso}T12:00:00+08:00`);

/**
 * The Operation petty cash: money received by the holder (Mr. Reza) and what was spent, with the receipt. Private: only the
 * holder and the Director of Finance (and her assistant) can open it; the database enforces the same.
 */
export default async function OperationPettyCashPage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; edit?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("user_can_use_operation_petty_cash");
  const sp = await searchParams;
  const query = sp.company ? `?company=${sp.company}` : "";

  if (allowed !== true) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Petty Cash</p>
        </div>
        <DriverLogisticsSubNav />
        <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-secondary">
          The Operation petty cash is private. Only the person who holds it and the Director of Finance can open it.
        </div>
      </div>
    );
  }

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;
  const defaultCompanyId = sp.company && accessibleIds.includes(sp.company) ? sp.company : selectable[0]?.id;

  const { data, error } = await supabase
    .from("operation_petty_cash")
    .select("*, companies(name)")
    .in("company_id", targetCompanyIds)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const entries = data ?? [];

  // balance after each entry, per company (the float of each company is kept apart)
  const running = new Map<string, number>();
  const withBalance = entries.map((e) => {
    const next = (running.get(e.company_id) ?? 0) + (e.entry_type === "top_up" ? Number(e.amount) : -Number(e.amount));
    running.set(e.company_id, next);
    return { ...e, balance: next };
  });
  const balanceByCompany = companies.filter((c) => running.has(c.id)).map((c) => ({ name: c.name, balance: running.get(c.id) ?? 0 }));
  const totalBalance = Array.from(running.values()).reduce((t, v) => t + v, 0);

  const thisMonth = todayInMalaysia().slice(0, 7);
  const months = Array.from(new Set([thisMonth, ...entries.map((e) => e.entry_date.slice(0, 7))])).sort().reverse();
  const month = sp.month === "all" ? "all" : sp.month && MONTH_RE.test(sp.month) ? sp.month : thisMonth;
  const shown = withBalance.filter((e) => month === "all" || e.entry_date.startsWith(month)).reverse();
  const received = shown.filter((e) => e.entry_type === "top_up").reduce((t, e) => t + Number(e.amount), 0);
  const spent = shown.filter((e) => e.entry_type === "expense").reduce((t, e) => t + Number(e.amount), 0);

  const editing = sp.edit ? withBalance.find((e) => e.id === sp.edit) : undefined;
  const editingRow: OperationPettyCashRow | undefined = editing
    ? { id: editing.id, company_id: editing.company_id, entry_type: editing.entry_type as EntryType, entry_date: editing.entry_date, category: editing.category, description: editing.description, amount: Number(editing.amount), document_id: editing.document_id, created_by: editing.created_by }
    : undefined;

  const listHref = `/driver-logistics/petty-cash${query}${query ? "&" : "?"}month=${month}`;
  const editHref = (id: string) => `${listHref}&edit=${id}`;
  const exportHeaders = ["Date", "Company", "Type", "Category", "Description", "Received (RM)", "Spent (RM)", "Balance (RM)"];
  const exportRows = [...shown].reverse().map((e): (string | number)[] => [e.entry_date, e.companies?.name ?? "", ENTRY_TYPE_LABEL[e.entry_type as EntryType] ?? e.entry_type, e.category ?? "", e.description ?? "", e.entry_type === "top_up" ? Number(e.amount) : "", e.entry_type === "expense" ? Number(e.amount) : "", e.balance]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Petty Cash — the Operation float: money received and what was spent, with the receipts</p>
      </div>

      <DriverLogisticsSubNav />
      <UndoBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Float Balance" value={formatPrice(totalBalance)} tone={totalBalance < 0 ? "warning" : "neutral"} iconTone={totalBalance < 0 ? "warning" : "success"} />
        <KpiCard label={month === "all" ? "Received (all time)" : "Received this month"} value={formatPrice(received)} tone="success" iconTone="success" />
        <KpiCard label={month === "all" ? "Spent (all time)" : "Spent this month"} value={formatPrice(spent)} tone="neutral" iconTone="warning" />
        <KpiCard label="Entries" value={String(shown.length)} />
      </div>
      {balanceByCompany.length > 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-text-secondary">
          {balanceByCompany.map((b) => (
            <span key={b.name}>
              {b.name}: <strong className={b.balance < 0 ? "text-danger" : "text-text"}>{formatPrice(b.balance)}</strong>
            </span>
          ))}
        </div>
      )}

      <OperationPettyCashForm key={editing?.id ?? "new"} companies={selectable} defaultCompanyId={defaultCompanyId} editing={editingRow} listHref={listHref} />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="text-[15px] font-bold text-text">Petty cash records</div>
          <div className="flex flex-wrap items-center gap-3">
            <form method="get" className="flex items-center gap-2">
              {sp.company && <input type="hidden" name="company" value={sp.company} />}
              <label className="text-[12px] font-semibold text-text-secondary" htmlFor="opc-month">Month</label>
              <select id="opc-month" name="month" defaultValue={month} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[12.5px]">
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="all">All</option>
              </select>
              <button type="submit" className="h-8 rounded-md border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text">Show</button>
            </form>
            <ExportListButtons filenameBase={`operation-petty-cash-${month}`} headers={exportHeaders} rows={exportRows} />
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyRow text="No petty cash records for this month yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="bg-surface-alt">
                <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-4 py-2.5">Details</th>
                  <th className="px-4 py-2.5 text-right">Received</th>
                  <th className="px-4 py-2.5 text-right">Spent</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                  <th className="px-4 py-2.5">Receipt</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="border-t border-border text-[13px]">
                    <td className="px-4 py-2.5 text-text-secondary">{dayLabel(e.entry_date)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{e.companies?.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-text">{e.description || (e.entry_type === "top_up" ? ENTRY_TYPE_LABEL.top_up : "—")}</div>
                      {e.category && <div className="text-[11.5px] text-text-muted">{e.category}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-success">{e.entry_type === "top_up" ? formatPrice(Number(e.amount)) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-text">{e.entry_type === "expense" ? formatPrice(Number(e.amount)) : ""}</td>
                    <td className={`px-4 py-2.5 text-right ${e.balance < 0 ? "font-semibold text-danger" : "text-text-secondary"}`}>{formatPrice(e.balance)}</td>
                    <td className="px-4 py-2.5">{e.document_id ? <DocumentViewLink documentId={e.document_id} /> : <span className="text-text-muted">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <OperationPettyCashRowActions id={e.id} editHref={editHref(e.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
