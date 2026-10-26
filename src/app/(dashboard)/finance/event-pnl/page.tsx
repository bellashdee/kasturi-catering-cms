import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { eventPnlCompanies, eventPnlReviewItems, eventPnlTrend, listEventPnl } from "@/lib/finance/eventPnlQueries";
import { DATA_FLAG_LABEL, formatChange, formatMargin, percentChange, totalEventPnl, VERDICT_LABEL, VERDICT_TONE } from "@/lib/finance/eventPnl";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatRM } from "@/lib/finance/payments";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { formatMalaysiaDateTime } from "@/lib/format";
import { malaysiaMonthNow } from "@/lib/driverAttendance/date";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { PrintButton } from "@/components/finance/EventPnlForms";
import { Select } from "@/components/ui/Select";

type SearchParams = { company?: string; year?: string; month?: string; q?: string; customer?: string; status?: string };

const money = (n: number) => formatRM(n);

export default async function MonthlyEventPnlPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const supabase = await createClient();
  const pnlCompanies = await eventPnlCompanies(supabase);
  const { targetCompanyIds } = resolveCompanyScope(session, pnlCompanies, sp.company);
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds);

  const header = (
    <>
      <div className="print:hidden">
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Monthly Event P&amp;L — profit of each event for Signature Solution and Kasturi Indah</p>
      </div>
      <div className="print:hidden">
        <FinanceAdminSubNav />
      </div>
    </>
  );

  if (adminIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="Event P&L holds confidential event financial records and is only available to Finance / Admin users of Signature Solution and Kasturi Indah." />
      </div>
    );
  }

  const now = malaysiaMonthNow();
  const year = Number(sp.year) || now.year;
  const month = Math.min(12, Math.max(1, Number(sp.month) || now.month));
  const filters = { year, month, search: sp.q, customer: sp.customer, status: sp.status };

  const [rows, trend, review] = await Promise.all([
    listEventPnl(supabase, adminIds, filters),
    eventPnlTrend(supabase, adminIds, year, month, 6),
    eventPnlReviewItems(supabase, adminIds, year, month),
  ]);

  const totals = totalEventPnl(rows.map((r) => r.pnl));
  const companyName = sp.company && pnlCompanies.find((c) => c.id === sp.company)?.name;
  const scopeLabel = companyName ?? "Signature Solution + Kasturi Indah (consolidated)";
  const periodLabel = `${MONTH_LABEL[month - 1]} ${year}`;
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const current = trend[trend.length - 1];
  const sortedByProfit = [...rows].filter((r) => r.pnl.verdict !== "no_data").sort((a, b) => b.pnl.netProfit - a.pnl.netProfit);
  const flagged = rows.filter((r) => r.flags.length > 0);
  const byCompany = pnlCompanies
    .filter((c) => adminIds.includes(c.id))
    .map((c) => ({ company: c, t: totalEventPnl(rows.filter((r) => r.company_id === c.id).map((r) => r.pnl)) }));

  const exportQuery = new URLSearchParams({ year: String(year), month: String(month) });
  for (const k of ["company", "q", "customer", "status"] as const) if (sp[k]) exportQuery.set(k, sp[k]!);

  const cards: { label: string; value: string; tone?: string }[] = [
    { label: "Total Event Revenue", value: money(totals.netRevenue) },
    { label: "Event Direct Costs", value: money(totals.directCosts) },
    { label: "Total Gross Profit", value: money(totals.grossProfit), tone: totals.grossProfit < 0 ? "text-danger" : "text-text" },
    { label: "Additional Event Expenses", value: money(totals.additionalExpenses) },
    { label: "Total Net Event Profit", value: money(totals.netProfit), tone: totals.netProfit < 0 ? "text-danger" : "text-success" },
    { label: "Overall Profit Margin", value: formatMargin(totals.margin), tone: totals.margin !== null && totals.margin < 0 ? "text-danger" : "text-text" },
    { label: "Number of Events", value: String(totals.events) },
    { label: "Loss-Making Events", value: String(totals.lossMaking), tone: totals.lossMaking > 0 ? "text-danger" : "text-text" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {header}

      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Month</label>
          <Select name="month" defaultValue={month} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year} className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Company</label>
          <Select name="company" defaultValue={sp.company ?? ""} className="mt-1 h-9 w-52 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">Both companies (consolidated)</option>
            {pnlCompanies.filter((c) => adminIds.includes(c.id) || session.hasAllCompaniesAccess).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Event name / reference</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="e.g. EV-2610-001" className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Customer</label>
          <input name="customer" defaultValue={sp.customer ?? ""} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Event status</label>
          <Select name="status" defaultValue={sp.status ?? ""} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All statuses</option>
            {Object.entries(EVENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[16px] font-extrabold text-text">{scopeLabel} — {periodLabel}</div>
          <div className="text-[12px] text-text-muted">Report generated {formatMalaysiaDateTime(new Date().toISOString())} · events counted by event date · actual figures only</div>
        </div>
        <div className="flex gap-2 print:hidden">
          <a href={`/finance/event-pnl/export?${exportQuery.toString()}&format=csv`} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">Export CSV</a>
          <a href={`/finance/event-pnl/export?${exportQuery.toString()}&format=xlsx`} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">Export Excel</a>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{c.label}</div>
            <div className={`mt-1 text-xl font-extrabold ${c.tone ?? "text-text"}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {(flagged.length > 0 || review.unlinked.length > 0 || review.notCounted.length > 0 || totals.estimatedCosts > 0) && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[12.5px] text-warning">
          <div className="font-bold">Missing-data warnings for this report</div>
          <ul className="mt-1 list-disc pl-5">
            {flagged.length > 0 && <li>{flagged.length} event{flagged.length === 1 ? "" : "s"} with missing revenue or cost information (listed below).</li>}
            {review.notCounted.length > 0 && <li>{review.notCounted.length} invoice{review.notCounted.length === 1 ? "" : "s"} linked to an event but not recorded as revenue yet.</li>}
            {review.unlinked.length > 0 && <li>{review.unlinked.length} customer invoice{review.unlinked.length === 1 ? "" : "s"} not linked to any event (not included).</li>}
            {totals.estimatedCosts > 0 && <li>Estimated costs of {money(totals.estimatedCosts)} are recorded but NOT included in these figures (actual costs only).</li>}
          </ul>
        </div>
      )}

      <SectionCard title="Events">
        {rows.length === 0 ? (
          <EmptyRow text={`No events with an event date in ${periodLabel}${sp.q || sp.customer || sp.status ? " match these filters" : ""}.`} />
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                  {["Event date", "Reference", "Event", "Company", "Customer", "Net revenue", "Direct costs", "Gross profit", "Additional", "Net profit", "Margin", "Status"].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 ${i >= 5 && i <= 10 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-surface-alt">
                    <td className="px-3 py-2.5 text-text-secondary">{r.eventDate.split("-").reverse().join("/")}</td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-text-secondary">{r.eventReference ?? "—"}</td>
                    <td className="px-3 py-2.5 font-semibold text-text"><Link href={`/finance/event-pnl/${r.id}`} className="hover:text-primary hover:underline">{r.eventName}</Link></td>
                    <td className="px-3 py-2.5 text-text-secondary">{r.companyName}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{r.customerName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">{money(r.pnl.netRevenue)}</td>
                    <td className="px-3 py-2.5 text-right">{money(r.pnl.directCosts)}</td>
                    <td className={`px-3 py-2.5 text-right ${r.pnl.grossProfit < 0 ? "text-danger" : ""}`}>{money(r.pnl.grossProfit)}</td>
                    <td className="px-3 py-2.5 text-right">{money(r.pnl.additionalExpenses)}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${r.pnl.netProfit < 0 ? "text-danger" : "text-text"}`}>{money(r.pnl.netProfit)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div>{formatMargin(r.pnl.margin)}</div>
                      <StatusBadge tone={VERDICT_TONE[r.pnl.verdict]}>{VERDICT_LABEL[r.pnl.verdict]}</StatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">{EVENT_STATUS_LABEL[r.status] ?? r.status}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-alt text-[12.5px] font-extrabold text-text">
                  <td className="px-3 py-2.5" colSpan={5}>Monthly totals ({totals.events} event{totals.events === 1 ? "" : "s"})</td>
                  <td className="px-3 py-2.5 text-right">{money(totals.netRevenue)}</td>
                  <td className="px-3 py-2.5 text-right">{money(totals.directCosts)}</td>
                  <td className="px-3 py-2.5 text-right">{money(totals.grossProfit)}</td>
                  <td className="px-3 py-2.5 text-right">{money(totals.additionalExpenses)}</td>
                  <td className="px-3 py-2.5 text-right">{money(totals.netProfit)}</td>
                  <td className="px-3 py-2.5 text-right">{formatMargin(totals.margin)}</td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-4 text-[11.5px] text-text-muted">Monthly margin = total net event profit ÷ total net event revenue (not an average of event margins). Customer payments and supplier payments are never added: only revenue and costs recorded against events count.</p>
      </SectionCard>

      {!sp.company && byCompany.length > 1 && (
        <SectionCard title="By company (each event counted once)">
          <div className="grid gap-3 sm:grid-cols-2">
            {byCompany.map(({ company, t }) => (
              <Link key={company.id} href={`/finance/event-pnl?${new URLSearchParams({ ...Object.fromEntries(exportQuery), company: company.id }).toString()}`} className="rounded-lg border border-border p-4 hover:bg-surface-alt">
                <div className="text-[13.5px] font-bold text-text">{company.name}</div>
                <div className="mt-1 text-[12.5px] text-text-secondary">{t.events} events · revenue {money(t.netRevenue)} · costs {money(t.directCosts + t.additionalExpenses)}</div>
                <div className={`mt-1 text-[14px] font-extrabold ${t.netProfit < 0 ? "text-danger" : "text-success"}`}>{money(t.netProfit)} <span className="text-[12px] font-semibold text-text-muted">({formatMargin(t.margin)})</span></div>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="This month vs previous month">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted"><th className="py-2">Measure</th><th className="py-2 text-right">{prev?.label ?? "Previous"}</th><th className="py-2 text-right">{current?.label ?? "This month"}</th><th className="py-2 text-right">Change</th></tr></thead>
            <tbody>
              {([
                ["Net event revenue", prev?.revenue, current?.revenue],
                ["Direct costs", prev?.directCosts, current?.directCosts],
                ["Net event profit", prev?.netProfit, current?.netProfit],
              ] as const).map(([label, p, c]) => (
                <tr key={label} className="border-t border-border">
                  <td className="py-2 font-semibold text-text">{label}</td>
                  <td className="py-2 text-right">{p === undefined ? "—" : money(p)}</td>
                  <td className="py-2 text-right">{c === undefined ? "—" : money(c)}</td>
                  <td className="py-2 text-right">{c === undefined ? "n/a" : formatChange(percentChange(c, p))}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-2 font-semibold text-text">Profit margin</td>
                <td className="py-2 text-right">{prev ? formatMargin(prev.margin) : "—"}</td>
                <td className="py-2 text-right">{current ? formatMargin(current.margin) : "—"}</td>
                <td className="py-2 text-right">{prev && current && prev.margin !== null && current.margin !== null ? `${(current.margin - prev.margin >= 0 ? "+" : "")}${(current.margin - prev.margin).toFixed(1)} pts` : "n/a"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-text-muted">Percentage changes are shown only when the previous month has a non-zero figure. Trend uses the same company selection, without the name / customer / status filters.</p>
      </SectionCard>

      <SectionCard title="Six-month trend">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted"><th className="py-2">Month</th><th className="py-2 text-right">Events</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Direct costs</th><th className="py-2 text-right">Net profit</th><th className="py-2 text-right">Margin</th></tr></thead>
            <tbody>
              {trend.map((p) => (
                <tr key={p.key} className={`border-t border-border ${p.key === current?.key ? "bg-surface-alt font-semibold" : ""}`}>
                  <td className="py-2">{p.label}</td>
                  <td className="py-2 text-right">{p.events}</td>
                  <td className="py-2 text-right">{money(p.revenue)}</td>
                  <td className="py-2 text-right">{money(p.directCosts)}</td>
                  <td className={`py-2 text-right ${p.netProfit < 0 ? "text-danger" : ""}`}>{money(p.netProfit)}</td>
                  <td className="py-2 text-right">{formatMargin(p.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Top 5 most profitable events">
          {sortedByProfit.length === 0 ? <EmptyRow text="No events with figures yet." /> : (
            <ol className="divide-y divide-border text-[13px]">
              {sortedByProfit.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2"><Link href={`/finance/event-pnl/${r.id}`} className="font-semibold text-text hover:text-primary">{r.eventName}</Link><span className={r.pnl.netProfit < 0 ? "font-bold text-danger" : "font-bold text-success"}>{money(r.pnl.netProfit)}</span></li>
              ))}
            </ol>
          )}
        </SectionCard>
        <SectionCard title="5 lowest-profit / loss-making events">
          {sortedByProfit.length === 0 ? <EmptyRow text="No events with figures yet." /> : (
            <ol className="divide-y divide-border text-[13px]">
              {[...sortedByProfit].reverse().slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2"><Link href={`/finance/event-pnl/${r.id}`} className="font-semibold text-text hover:text-primary">{r.eventName}</Link><span className={r.pnl.netProfit < 0 ? "font-bold text-danger" : "font-bold text-text"}>{money(r.pnl.netProfit)}</span></li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Budget vs actual">
        {rows.length === 0 ? <EmptyRow text="No events this month." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[12.5px]">
              <thead><tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted"><th className="py-2">Event</th><th className="py-2 text-right">Budget revenue</th><th className="py-2 text-right">Actual revenue</th><th className="py-2 text-right">Budget costs</th><th className="py-2 text-right">Actual costs</th><th className="py-2 text-right">Budget profit</th><th className="py-2 text-right">Actual profit</th><th className="py-2 text-right">Profit variance</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.budget;
                  const na = <span className="text-text-muted">Budget not set</span>;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 font-semibold text-text">{r.eventName}</td>
                      <td className="py-2 text-right">{b?.revenue.budgeted == null ? na : money(b.revenue.budgeted)}</td>
                      <td className="py-2 text-right">{money(r.pnl.netRevenue)}</td>
                      <td className="py-2 text-right">{b?.costs.budgeted == null ? na : money(b.costs.budgeted)}</td>
                      <td className="py-2 text-right">{money(r.pnl.directCosts + r.pnl.additionalExpenses)}</td>
                      <td className="py-2 text-right">{b?.profit.budgeted == null ? na : money(b.profit.budgeted)}</td>
                      <td className="py-2 text-right">{money(r.pnl.netProfit)}</td>
                      <td className="py-2 text-right">{b?.profit.variance == null ? "—" : `${money(b.profit.variance)} (${formatChange(b.profit.variancePct)})`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Needs review">
        {flagged.length === 0 && review.unlinked.length === 0 && review.notCounted.length === 0 ? (
          <EmptyRow text="Nothing to review: every event has figures and every invoice of the month is placed." />
        ) : (
          <div className="flex flex-col gap-4 text-[13px]">
            {flagged.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Events with missing revenue or cost information</div>
                <ul className="divide-y divide-border">
                  {flagged.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><Link href={`/finance/event-pnl/${r.id}`} className="font-semibold text-text hover:text-primary">{r.eventName}</Link><span className="text-text-secondary">{r.flags.map((f) => DATA_FLAG_LABEL[f]).join(" · ")}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {review.notCounted.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Invoices linked to an event but not counted as revenue yet</div>
                <ul className="divide-y divide-border">{review.notCounted.map((i) => <li key={i.id} className="py-1.5"><Link href={i.href ?? "#"} className="font-semibold text-text hover:text-primary">{i.label}</Link> <span className="text-text-secondary">— {i.detail}</span></li>)}</ul>
              </div>
            )}
            {review.unlinked.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Customer invoices not linked to any event (not assigned automatically)</div>
                <ul className="divide-y divide-border">{review.unlinked.map((i) => <li key={i.id} className="py-1.5"><Link href={i.href ?? "#"} className="font-semibold text-text hover:text-primary">{i.label}</Link> <span className="text-text-secondary">— {i.detail}</span></li>)}</ul>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
