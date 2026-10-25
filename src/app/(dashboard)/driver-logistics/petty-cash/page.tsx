import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { formatPrice, formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { ENTRY_TYPE_LABEL, type EntryType, type OperationPettyCashRow } from "@/lib/operationPettyCash/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { ExportListButtons } from "@/components/procurement/ExportListButtons";
import { OperationPettyCashForm } from "@/components/operationPettyCash/OperationPettyCashForm";
import { OperationPettyCashRowActions } from "@/components/operationPettyCash/OperationPettyCashRowActions";
import { UndoBanner } from "@/components/operationPettyCash/UndoBanner";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { PettyCashOverview } from "@/components/pettyCash/PettyCashOverview";
import { buildOverview } from "@/lib/pettyCash/overview";
import { loadPersonOptions } from "@/lib/pettyCash/people";

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
      <SoftPage>
        <SoftHeader title="Operation Management" subtitle="Petty Cash" />
        <DriverLogisticsSubNav />
        <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-[14px] text-text-secondary">
          The Operation petty cash is private. Only the person who holds it and the Director of Finance can open it.
        </div>
      </SoftPage>
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
  const people = await loadPersonOptions(supabase);

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
  const overview = buildOverview(
    entries.map((e) => ({ date: e.entry_date, kind: e.entry_type === "top_up" ? ("in" as const) : ("out" as const), amount: Number(e.amount), category: e.category })),
    month,
    thisMonth,
  );

  const editing = sp.edit ? withBalance.find((e) => e.id === sp.edit) : undefined;
  const editingRow: OperationPettyCashRow | undefined = editing
    ? { id: editing.id, company_id: editing.company_id, entry_type: editing.entry_type as EntryType, entry_date: editing.entry_date, category: editing.category, description: editing.description, amount: Number(editing.amount), document_id: editing.document_id, created_by: editing.created_by, person_name: editing.person_name, person_position: editing.person_position }
    : undefined;

  const listHref = `/driver-logistics/petty-cash${query}${query ? "&" : "?"}month=${month}`;
  const editHref = (id: string) => `${listHref}&edit=${id}`;
  const exportHeaders = ["Date", "Company", "Type", "Category", "Description", "Name", "Position", "Received (RM)", "Spent (RM)", "Balance (RM)"];
  const exportRows = [...shown].reverse().map((e): (string | number)[] => [e.entry_date, e.companies?.name ?? "", ENTRY_TYPE_LABEL[e.entry_type as EntryType] ?? e.entry_type, e.category ?? "", e.description ?? "", e.person_name ?? "", e.person_position ?? "", e.entry_type === "top_up" ? Number(e.amount) : "", e.entry_type === "expense" ? Number(e.amount) : "", e.balance]);

  const periodLabel = month === "all" ? "All time" : month;

  return (
    <SoftPage>
      <SoftHeader title="Operation Management" subtitle="Petty Cash: the Operation float, money received and what was spent, with the receipts" />

      <DriverLogisticsSubNav />
      <UndoBanner />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3">
        <form method="get" className="flex flex-wrap items-center gap-2">
          {sp.company && <input type="hidden" name="company" value={sp.company} />}
          <label className="text-[12.5px] font-bold uppercase tracking-wide text-text-muted" htmlFor="opc-month-top">Month</label>
          <select id="opc-month-top" name="month" defaultValue={month} className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[14px] font-semibold">
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="all">All</option>
          </select>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Show</button>
        </form>
        <div className="text-[13px] text-text-secondary">
          Float balance (all time): <strong className={totalBalance < 0 ? "text-danger" : "text-text"}>{formatPrice(totalBalance)}</strong>
        </div>
      </div>

      <PettyCashOverview overview={overview} periodLabel={periodLabel} />

      {balanceByCompany.length > 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-text-secondary">
          {balanceByCompany.map((b) => (
            <span key={b.name}>
              {b.name}: <strong className={b.balance < 0 ? "text-danger" : "text-text"}>{formatPrice(b.balance)}</strong>
            </span>
          ))}
        </div>
      )}

      <OperationPettyCashForm key={editing?.id ?? "new"} companies={selectable} defaultCompanyId={defaultCompanyId} editing={editingRow} listHref={listHref} people={people} />

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
                      {(e.person_name || e.person_position) && (
                        <div className="text-[11.5px] text-text-secondary">{`${e.entry_type === "top_up" ? "Received by" : "Spent by"}: ${[e.person_name, e.person_position].filter(Boolean).join(" · ")}`}</div>
                      )}
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
    </SoftPage>
  );
}
