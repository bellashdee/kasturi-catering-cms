import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { eventPnlCompanyIds, getEventPnlDetail } from "@/lib/finance/eventPnlQueries";
import {
  ADDITIONAL_COST_TYPE_LABEL,
  COST_BASIS_LABEL,
  COST_GROUPS,
  DATA_FLAG_LABEL,
  DIRECT_COST_TYPE_LABEL,
  formatChange,
  formatMargin,
  PAYMENT_STATUS_LABEL,
  REVENUE_ADDITIONS,
  REVENUE_DEDUCTIONS,
  REVENUE_TYPE_LABEL,
  VERDICT_LABEL,
  VERDICT_TONE,
} from "@/lib/finance/eventPnl";
import { formatRM } from "@/lib/finance/payments";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { formatMalaysiaDateTime } from "@/lib/format";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { AddInvoiceRevenueButton, BudgetForm, CostForm, EntryActions, PrintButton, RevenueForm } from "@/components/finance/EventPnlForms";

const money = (n: number) => formatRM(n);
const date = (d: string) => d.split("-").reverse().join("/");
const AUDIT_LABEL: Record<string, string> = {
  revenue_added: "Revenue added",
  revenue_edited: "Revenue edited",
  revenue_removed: "Revenue removed",
  cost_added: "Cost added",
  cost_edited: "Cost edited",
  cost_removed: "Cost removed",
  budget_saved: "Budget saved",
};

export default async function EventPnlDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const supabase = await createClient();

  const detail = await getEventPnlDetail(supabase, id);
  if (!detail) notFound();
  const { event, pnl } = detail;

  const allowed = (await eventPnlCompanyIds(supabase, [event.company_id])).length > 0;
  if (!allowed) {
    return (
      <div className="flex flex-col gap-5">
        <FinanceAdminSubNav />
        <EmptyRow text="Event P&L holds confidential event financial records and is only available to Finance / Admin users of the company." />
      </div>
    );
  }

  // every change to this event's revenue, costs and budget is logged against the event itself, so removed entries stay in the history
  const { data: auditRows } = await supabase.from("task_audit_log").select("*").eq("related_table", "event_pnl").eq("related_id", id).order("created_at", { ascending: false }).limit(100);
  const actorIds = Array.from(new Set((auditRows ?? []).map((a) => a.performed_by).filter((x): x is string => !!x)));
  const actors = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const p of people ?? []) actors.set(p.id, p.full_name);
  }

  const countedInvoiceIds = new Set(detail.revenue.map((r) => r.customer_invoice_id).filter(Boolean));
  const supplierOptions = detail.availableSupplierInvoices.map((s) => ({ id: s.id, invoice_number: s.invoice_number, amount: s.amount, invoice_date: s.invoice_date, supplierName: (s as unknown as { suppliers?: { name?: string } | null }).suppliers?.name ?? "Supplier" }));
  const estimated = detail.costs.filter((c) => c.cost_basis === "estimated");
  const b = detail.budgetComparison;
  const na = <span className="text-text-muted">Budget not set</span>;

  const line = (labelText: string, value: number, opts?: { bold?: boolean; negative?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 text-[13.5px] ${opts?.bold ? "font-extrabold text-text" : "text-text-secondary"}`}>
      <span>{labelText}</span>
      <span className={opts?.bold ? (value < 0 ? "text-danger" : "text-text") : "font-semibold text-text"}>{opts?.negative ? `− ${money(value)}` : money(value)}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden"><FinanceAdminSubNav /></div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/finance/event-pnl?year=${event.event_date.slice(0, 4)}&month=${Number(event.event_date.slice(5, 7))}`} className="text-[12.5px] font-semibold text-text-secondary print:hidden">← Monthly Event P&amp;L</Link>
          <h1 className="mt-1 text-[22px] font-extrabold text-text">{event.event_name}</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {event.event_reference ?? "—"} · {event.companies?.name} · {date(event.event_date)} · {EVENT_STATUS_LABEL[event.status] ?? event.status}
            {event.customers?.name ? ` · ${event.customers.name}` : ""}{event.pax_count ? ` · ${event.pax_count} pax` : ""}
          </p>
          <p className="text-[11.5px] text-text-muted">Report generated {formatMalaysiaDateTime(new Date().toISOString())} · actual figures only</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <StatusBadge tone={VERDICT_TONE[pnl.verdict]}>{VERDICT_LABEL[pnl.verdict]}</StatusBadge>
          <a href={`/finance/event-pnl/export?event=${id}&format=xlsx`} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">Export Excel</a>
          <PrintButton />
        </div>
      </div>

      {detail.flags.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[12.5px] font-semibold text-warning">{detail.flags.map((f) => DATA_FLAG_LABEL[f]).join(" · ")}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Profit & Loss">
          <div className="divide-y divide-border">
            <div className="pb-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Revenue</div>
              {REVENUE_ADDITIONS.map((k) => {
                const total = detail.revenue.filter((r) => r.entry_type === k).reduce((t, r) => t + Number(r.amount), 0);
                return total > 0 ? <div key={k}>{line(REVENUE_TYPE_LABEL[k], total)}</div> : null;
              })}
              {line("Gross event revenue", pnl.grossRevenue)}
              {REVENUE_DEDUCTIONS.map((k) => {
                const total = detail.revenue.filter((r) => r.entry_type === k).reduce((t, r) => t + Number(r.amount), 0);
                return total > 0 ? <div key={k}>{line(REVENUE_TYPE_LABEL[k], total, { negative: true })}</div> : null;
              })}
              {line("Net event revenue", pnl.netRevenue, { bold: true })}
            </div>
            <div className="py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Direct costs (actual)</div>
              {COST_GROUPS.map((g) => <div key={g}>{line(g, pnl.directByGroup[g])}</div>)}
              {line("Total direct costs", pnl.directCosts, { bold: true })}
              {pnl.fromCostingSheet > 0 && <p className="text-[11.5px] text-text-muted">Includes {money(pnl.fromCostingSheet)} from the Catering event costing sheet. Do not also enter those costs here.</p>}
            </div>
            <div className="py-2">{line("Gross profit", pnl.grossProfit, { bold: true })}</div>
            <div className="py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Additional event-specific expenses</div>
              {line("Total additional expenses", pnl.additionalExpenses)}
            </div>
            <div className="pt-2">
              {line("Net event profit", pnl.netProfit, { bold: true })}
              <div className="flex items-center justify-between py-1.5 text-[13.5px] font-extrabold text-text"><span>Profit margin</span><span>{formatMargin(pnl.margin)}</span></div>
            </div>
          </div>
          {pnl.estimatedCosts > 0 && <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2 text-[12px] text-text-secondary">Estimated costs of {money(pnl.estimatedCosts)} are recorded but not included above (actual costs only).</p>}
        </SectionCard>

        <SectionCard title="Budget vs actual">
          {!b ? (
            <EmptyRow text="Budget not set for this event." />
          ) : (
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted"><th className="py-2" /><th className="py-2 text-right">Budget</th><th className="py-2 text-right">Actual</th><th className="py-2 text-right">Variance</th></tr></thead>
              <tbody>
                {([["Revenue", b.revenue], ["Costs (direct + additional)", b.costs], ["Profit", b.profit]] as const).map(([name, l]) => (
                  <tr key={name} className="border-t border-border">
                    <td className="py-2 font-semibold text-text">{name}</td>
                    <td className="py-2 text-right">{l.budgeted === null ? na : money(l.budgeted)}</td>
                    <td className="py-2 text-right">{money(l.actual)}</td>
                    <td className="py-2 text-right">{l.variance === null ? "—" : `${money(l.variance)} (${formatChange(l.variancePct)})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <details className="mt-4 print:hidden">
            <summary className="cursor-pointer text-[13px] font-semibold text-primary">{b ? "Edit budget" : "Set budget"}</summary>
            <div className="mt-3"><BudgetForm eventId={id} budget={detail.budget} /></div>
          </details>
        </SectionCard>
      </div>

      <SectionCard title={`Revenue entries (${detail.revenue.length})`}>
        {detail.revenue.length === 0 ? <EmptyRow text="No revenue recorded for this event yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted"><th className="py-2">Date</th><th className="py-2">Type</th><th className="py-2">Description</th><th className="py-2 text-right">Amount</th><th className="py-2 print:hidden" /></tr></thead>
              <tbody>
                {detail.revenue.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-2 text-text-secondary">{date(r.entry_date)}</td>
                    <td className="py-2 font-semibold text-text">{REVENUE_TYPE_LABEL[r.entry_type]}</td>
                    <td className="py-2 text-text-secondary">{r.description ?? "—"}{r.notes ? <div className="text-[11.5px] text-text-muted">{r.notes}</div> : null}{r.document_id && <div><DocumentViewLink documentId={r.document_id} label="📎 Document" /></div>}</td>
                    <td className={`py-2 text-right font-semibold ${(REVENUE_DEDUCTIONS as readonly string[]).includes(r.entry_type) ? "text-danger" : "text-text"}`}>{(REVENUE_DEDUCTIONS as readonly string[]).includes(r.entry_type) ? "− " : ""}{money(Number(r.amount))}</td>
                    <td className="py-2 text-right"><EntryActions kind="revenue" entry={r} eventId={id} companyId={event.company_id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {detail.invoices.length > 0 && (
          <div className="mt-4 rounded-lg border border-border p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Customer invoices linked to this event</div>
            <p className="text-[11.5px] text-text-muted">An issued invoice is not revenue until you count it here (amount before tax). Payments received are never added as revenue.</p>
            <ul className="mt-2 divide-y divide-border text-[12.5px]">
              {detail.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span><Link href={`/finance/invoices/${i.id}`} className="font-semibold text-text hover:text-primary">{i.invoice_number}</Link> · {date(i.invoice_date)} · {money(Number(i.amount))} · {i.status}</span>
                  {countedInvoiceIds.has(i.id) ? <StatusBadge tone="success">Counted as revenue</StatusBadge> : <span className="print:hidden"><AddInvoiceRevenueButton eventId={id} invoiceId={i.id} /></span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <details className="mt-4 print:hidden">
          <summary className="cursor-pointer text-[13px] font-semibold text-primary">+ Add revenue / discount / refund / credit note</summary>
          <div className="mt-3"><RevenueForm eventId={id} /></div>
        </details>
      </SectionCard>

      <SectionCard title={`Cost entries (${detail.costs.length})`}>
        {detail.costs.length === 0 ? <EmptyRow text="No costs recorded for this event yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[12.5px]">
              <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted"><th className="py-2">Date</th><th className="py-2">Category</th><th className="py-2">Supplier / reference</th><th className="py-2">Basis</th><th className="py-2 text-right">Qty × unit cost</th><th className="py-2 text-right">Total</th><th className="py-2">Payment</th><th className="py-2 print:hidden" /></tr></thead>
              <tbody>
                {detail.costs.map((c) => (
                  <tr key={c.id} className={`border-t border-border align-top ${c.cost_basis === "estimated" ? "bg-surface-alt text-text-muted" : ""}`}>
                    <td className="py-2">{date(c.cost_date)}</td>
                    <td className="py-2 font-semibold text-text">{DIRECT_COST_TYPE_LABEL[c.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[c.cost_type]}<div className="text-[11px] font-normal text-text-muted">{c.cost_class === "direct" ? "Direct" : "Additional"}</div></td>
                    <td className="py-2">{c.supplier_name ?? "—"}{c.reference_no ? <div className="text-[11.5px]">{c.reference_no}</div> : null}{c.description ? <div className="text-[11.5px] text-text-muted">{c.description}</div> : null}{c.document_id && <div><DocumentViewLink documentId={c.document_id} label="📎 Document" /></div>}{c.supplier_invoice_id && <div className="text-[11px] text-text-muted">Linked supplier invoice</div>}</td>
                    <td className="py-2"><StatusBadge tone={c.cost_basis === "actual" ? "info" : "warning"}>{COST_BASIS_LABEL[c.cost_basis]}</StatusBadge></td>
                    <td className="py-2 text-right">{c.quantity != null && c.unit_cost != null ? `${Number(c.quantity)}${c.unit ? ` ${c.unit}` : ""} × ${money(Number(c.unit_cost))}` : "—"}</td>
                    <td className="py-2 text-right font-semibold">{money(Number(c.amount))}</td>
                    <td className="py-2">{PAYMENT_STATUS_LABEL[c.payment_status]}</td>
                    <td className="py-2 text-right"><EntryActions kind="cost" entry={c} eventId={id} companyId={event.company_id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {estimated.length > 0 && <p className="mt-2 text-[11.5px] text-text-muted">Shaded rows are estimated costs: they are not counted in the P&amp;L.</p>}
          </div>
        )}
        <details className="mt-4 print:hidden">
          <summary className="cursor-pointer text-[13px] font-semibold text-primary">+ Add a cost</summary>
          <div className="mt-3"><CostForm eventId={id} companyId={event.company_id} supplierInvoices={supplierOptions} /></div>
        </details>
      </SectionCard>

      <SectionCard title="Audit trail">
        {(auditRows ?? []).length === 0 ? <EmptyRow text="No changes recorded yet." /> : (
          <ul className="divide-y divide-border text-[12.5px]">
            {(auditRows ?? []).map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex justify-between gap-3"><span className="font-semibold text-text">{AUDIT_LABEL[a.action] ?? a.action}</span><span className="text-text-muted">{formatMalaysiaDateTime(a.created_at)}</span></div>
                <div className="text-text-secondary">{a.performed_by ? actors.get(a.performed_by) ?? "User" : "System"}{a.previous_value ? ` · was: ${a.previous_value}` : ""}{a.new_value ? ` · ${a.new_value}` : ""}{a.reason ? ` · reason: ${a.reason}` : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
