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
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy, sortRows } from "@/lib/listSort";

type SearchParams = { company?: string; year?: string; month?: string; category?: string; show?: string; group?: string; sort?: string; dir?: string };

const SORTS = { priority: "Priority", payee: "Supplier / Payee", due: "Due date", amount: "Amount" };

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
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds, "finance-admin");

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
  // the rows inside each month / company follow Sort by (by default the highest priority first, then by name)
  const { sort, dir } = readSort(sp, SORTS, "priority", "desc");
  const ordered = sortBy(sortRows(visible, "asc", (p) => p.payee_name), sort, dir, {
    priority: (p) => priorityWeight(p.priority),
    payee: [(p) => p.payee_name, (p) => p.due_date],
    due: [(p) => p.due_date, (p) => p.payee_name],
    amount: (p) => Number(p.amount),
  });
  const companyOf = (p: Row) => p.companies?.name ?? "—";
  const periods = Array.from(new Set(visible.map((p) => p.period_month.slice(0, 7)))).sort();
  const companyNames = Array.from(new Set(visible.map(companyOf))).sort();
  const sumUnpaid = (rows: Row[]) => rows.filter((p) => p.status !== "paid").reduce((t, p) => t + Number(p.amount), 0);

  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (sp.company) params.set("company", sp.company);
    if (year && month) { params.set("year", String(year)); params.set("month", String(month)); }
    if (category) params.set("category", category);
    if (showPaid) params.set("show", "all");
    if (byCompanyFirst) params.set("group", "company");
    if (sp.sort) params.set("sort", sort);
    if (sp.dir) params.set("dir", dir);
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

      <ListFilters
        keep={{ company: sp.company, show: showPaid ? "all" : undefined, group: byCompanyFirst ? "company" : undefined }}
        sortOptions={SORTS}
        sort={sort}
        dir={dir}
        clearHref={`/finance/payments/checklist${sp.company ? `?company=${sp.company}` : ""}`}
      >
        <FilterField label="Month">
          <Select name="month" defaultValue={month ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All months</option>
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Year">
          <input type="number" name="year" defaultValue={year ?? ""} placeholder="All" className={`${FILTER_INPUT} w-24`} />
        </FilterField>
        <FilterField label="Category">
          <Select name="category" defaultValue={category ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All categories</option>
            <option value="supplier">Supplier Payment</option>
            <option value="rental">Rental Payment</option>
            <option value="utility">Utilities Payment</option>
          </Select>
        </FilterField>
      </ListFilters>
      <div className="-mt-2">
        <Link href={query({ show: showPaid ? "" : "all" })} className="inline-flex h-9 items-center rounded-lg border border-border-strong px-4 text-[13px] font-semibold text-text">
          {showPaid ? "Hide completed" : "Show completed too"}
        </Link>
      </div>

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
          const rows = ordered.filter((p) => companyOf(p) === companyName);
          return (
            <SectionCard key={companyName} title={`${companyLabel(companyName)} — still to pay ${formatRM(sumUnpaid(rows))}`}>
              <div className="-mx-5 -mb-5 flex flex-col">
                {Array.from(new Set(rows.map((p) => p.period_month.slice(0, 7)))).sort().map((period) => {
                  const inPeriod = rows.filter((p) => p.period_month.startsWith(period));
                  return (
                    <div key={period}>
                      {subHeading(`${monthTitle(period)} · ${inPeriod.length} item(s) · ${formatRM(inPeriod.reduce((t, p) => t + Number(p.amount), 0))}`)}
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
          const inPeriod = ordered.filter((p) => p.period_month.startsWith(period));
          return (
            <SectionCard key={period} title={`${monthTitle(period)} — ${inPeriod.length} item(s) · still to pay ${formatRM(sumUnpaid(inPeriod))}`}>
              <div className="-mx-5 -mb-5 flex flex-col">
                {Array.from(new Set(inPeriod.map(companyOf))).sort().map((companyName) => {
                  const rows = inPeriod.filter((p) => companyOf(p) === companyName);
                  return (
                    <div key={companyName}>
                      {subHeading(`${companyLabel(companyName)} · ${rows.length} item(s) · ${formatRM(rows.reduce((t, p) => t + Number(p.amount), 0))}`)}
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
