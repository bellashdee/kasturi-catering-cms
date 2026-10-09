import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds, listPaymentsForChecklist } from "@/lib/finance/paymentQueries";
import {
  PAYMENT_CATEGORY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  URGENCY_REMINDER,
  URGENCY_TONE,
  accountDisplay,
  formatRM,
  paymentUrgency,
  priorityWeight,
  type PaymentCategory,
  type Priority,
} from "@/lib/finance/payments";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { formatMalaysiaDate } from "@/lib/format";
import { todayInMalaysia } from "@/lib/driverAttendance/date";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { ChecklistActions } from "@/components/finance/ChecklistActions";

type SearchParams = { company?: string; year?: string; month?: string; category?: string; show?: string; group?: string };

function companyLabel(name: string): string {
  const code = /signature/i.test(name) ? "SS" : /kasturi/i.test(name) ? "KI" : /o2/i.test(name) ? "O2" : null;
  return code ? `${code} - ${name}` : name;
}

function monthTitle(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_LABEL[m - 1]} ${y}`;
}

/** The payment checklist for Finance: what still needs to be paid, by month (or by company), with priority and a weighted progress score. */
export default async function PaymentChecklistPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds);

  const header = (
    <>
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Payment Checklist — what still needs to be paid</p>
      </div>
      <FinanceAdminSubNav />
    </>
  );

  if (adminIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="The payment checklist contains bank details and is only available to Finance / Admin users of the company." />
      </div>
    );
  }

  const year = Number(sp.year) || undefined;
  const month = Number(sp.month) || undefined;
  const category = (["supplier", "rental", "utility"].includes(sp.category ?? "") ? sp.category : undefined) as PaymentCategory | undefined;
  const showPaid = sp.show === "all";
  const byCompanyFirst = sp.group === "company";
  const today = todayInMalaysia();

  const all = await listPaymentsForChecklist(supabase, adminIds, { year, month, category });
  type Row = (typeof all)[number];

  const total = all.length;
  const done = all.filter((p) => p.status === "paid");
  const totalScore = all.reduce((t, p) => t + priorityWeight(p.priority), 0);
  const doneScore = done.reduce((t, p) => t + priorityWeight(p.priority), 0);
  const percent = totalScore > 0 ? (doneScore / totalScore) * 100 : 0;
  const unpaid = all.filter((p) => p.status !== "paid");
  const unpaidTotal = unpaid.reduce((t, p) => t + Number(p.amount), 0);
  const inProgress = all.filter((p) => p.status === "in_progress").length;

  const visible = showPaid ? all : unpaid;
  const companyOf = (p: Row) => p.companies?.name ?? "—";
  const periods = Array.from(new Set(visible.map((p) => p.period_month.slice(0, 7)))).sort();
  const companyNames = Array.from(new Set(visible.map(companyOf))).sort();
  const sumUnpaid = (rows: Row[]) => rows.filter((p) => p.status !== "paid").reduce((t, p) => t + Number(p.amount), 0);
  const byPriority = (rows: Row[]) => [...rows].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || a.payee_name.localeCompare(b.payee_name));

  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (sp.company) params.set("company", sp.company);
    if (year && month) { params.set("year", String(year)); params.set("month", String(month)); }
    if (category) params.set("category", category);
    if (showPaid) params.set("show", "all");
    if (byCompanyFirst) params.set("group", "company");
    for (const [k, v] of Object.entries(extra)) { if (v) params.set(k, v); else params.delete(k); }
    return `/finance/payments/checklist?${params.toString()}`;
  };

  const renderRow = (p: Row) => {
    const u = paymentUrgency(p.status, p.due_date, today);
    const prio = (p.priority as Priority | null) ?? null;
    const remarks = p.remarks?.replace(/^Imported from [^·]*· sheet [^·]*(· )?/, "") ?? "";
    return (
      <div key={p.id} className={`flex items-center justify-between gap-4 px-5 py-2.5 text-[13px] ${p.status === "paid" ? "opacity-60" : ""}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-lg" title={p.status === "paid" ? "Completed" : p.status === "in_progress" ? "In Progress" : "Not Started"}>
            {p.status === "paid" ? "✅" : p.status === "in_progress" ? "🔄" : "⬜"}
          </span>
          <div className="min-w-0">
            <Link href={`/finance/payments/${p.id}`} className="font-semibold text-text hover:text-primary">
              {p.payee_name}
              {p.utility_provider ? <span className="ml-2 font-normal text-text-secondary">{p.utility_provider}</span> : null}
            </Link>
            <div className="truncate text-xs text-text-muted">
              {PAYMENT_CATEGORY_LABEL[p.category as PaymentCategory]} · {p.bank_name ? `${p.bank_name} ` : ""}{accountDisplay(p.account_no)}
              {p.status === "paid" && p.paid_details_pending ? " · ⚠ payment date & reference not entered yet" : ""}
              {p.due_date ? ` · due ${formatMalaysiaDate(`${p.due_date}T12:00:00+08:00`)}` : ""}
              {remarks ? ` · ${remarks}` : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {prio && <StatusBadge tone={PRIORITY_TONE[prio]}>{PRIORITY_LABEL[prio]}</StatusBadge>}
          {p.status !== "paid" && u !== "pending" && <StatusBadge tone={URGENCY_TONE[u]}>{URGENCY_REMINDER[u]}</StatusBadge>}
          <span className="w-28 text-right font-bold text-text">{formatRM(Number(p.amount))}</span>
          <ChecklistActions paymentId={p.id} status={p.status} />
        </div>
      </div>
    );
  };

  const subHeading = (text: string) => (
    <div className="border-y border-border bg-surface-alt px-5 py-2 text-[11.5px] font-bold uppercase tracking-wide text-text-muted">{text}</div>
  );

  return (
    <div className="flex flex-col gap-5">
      {header}

      <form method="get" className="flex flex-wrap items-end gap-3">
        {sp.company && <input type="hidden" name="company" value={sp.company} />}
        {showPaid && <input type="hidden" name="show" value="all" />}
        {byCompanyFirst && <input type="hidden" name="group" value="company" />}
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Year</label>
          <input type="number" name="year" defaultValue={year ?? ""} placeholder="All" className="mt-1 h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Month</label>
          <select name="month" defaultValue={month ?? ""} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All months</option>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Category</label>
          <select name="category" defaultValue={category ?? ""} className="mt-1 h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">All categories</option>
            <option value="supplier">Supplier Payment</option>
            <option value="rental">Rental Payment</option>
            <option value="utility">Utilities Payment</option>
          </select>
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply Filters</button>
        <Link href={query({ show: showPaid ? "" : "all" })} className="flex h-9 items-center rounded-lg border border-border-strong px-4 text-[13px] font-semibold text-text">
          {showPaid ? "Hide completed" : "Show completed too"}
        </Link>
      </form>

      <div className="flex gap-1 border-b border-border">
        {[
          { label: "By Month", href: query({ group: "" }), active: !byCompanyFirst },
          { label: "By Company", href: query({ group: "company" }), active: byCompanyFirst },
        ].map((t) => (
          <Link key={t.label} href={t.href} className={`border-b-2 px-3.5 py-2 text-[13px] font-semibold ${t.active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Total Activities", value: String(total) },
          { label: "Completed (Paid)", value: String(done.length) },
          { label: "In Progress", value: String(inProgress) },
          { label: "% Completed (weighted)", value: `${percent.toFixed(1)}%` },
          { label: "Still to Pay", value: formatRM(unpaidTotal) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{c.label}</div>
            <div className="mt-1 text-xl font-extrabold text-text">{c.value}</div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-text-muted">Score: High = 5, Medium = 3, Low = 1. Completed score {doneScore} of {totalScore}. A payment is Completed only when it is marked as paid with its payment date and reference.</p>

      {visible.length === 0 ? (
        <EmptyRow text={total === 0 ? "No payments recorded yet." : "Everything in this filter is paid. 🎉"} />
      ) : byCompanyFirst ? (
        companyNames.map((companyName) => {
          const rows = visible.filter((p) => companyOf(p) === companyName);
          return (
            <SectionCard key={companyName} title={`${companyLabel(companyName)} — still to pay ${formatRM(sumUnpaid(rows))}`}>
              <div className="-mx-5 -mb-5 flex flex-col">
                {Array.from(new Set(rows.map((p) => p.period_month.slice(0, 7)))).sort().map((period) => {
                  const inPeriod = byPriority(rows.filter((p) => p.period_month.startsWith(period)));
                  return (
                    <div key={period}>
                      {subHeading(`${monthTitle(period)} · ${inPeriod.length} item${inPeriod.length === 1 ? "" : "s"} · ${formatRM(inPeriod.reduce((t, p) => t + Number(p.amount), 0))}`)}
                      <div className="divide-y divide-border">{inPeriod.map(renderRow)}</div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          );
        })
      ) : (
        periods.map((period) => {
          const inPeriod = visible.filter((p) => p.period_month.startsWith(period));
          return (
            <SectionCard key={period} title={`${monthTitle(period)} — ${inPeriod.length} item${inPeriod.length === 1 ? "" : "s"} · still to pay ${formatRM(sumUnpaid(inPeriod))}`}>
              <div className="-mx-5 -mb-5 flex flex-col">
                {Array.from(new Set(inPeriod.map(companyOf))).sort().map((companyName) => {
                  const rows = byPriority(inPeriod.filter((p) => companyOf(p) === companyName));
                  return (
                    <div key={companyName}>
                      {subHeading(`${companyLabel(companyName)} · ${rows.length} item${rows.length === 1 ? "" : "s"} · ${formatRM(rows.reduce((t, p) => t + Number(p.amount), 0))}`)}
                      <div className="divide-y divide-border">{rows.map(renderRow)}</div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
