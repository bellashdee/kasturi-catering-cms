import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds } from "@/lib/finance/paymentQueries";
import { formatPrice, todayInMalaysia } from "@/lib/format";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";
import { isValidMonth, loadPayrollLines, shiftMonth, summarisePayroll } from "@/lib/hr/payrollCentre";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { PayrollCentreTable } from "@/components/hr/PayrollCentreTable";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { name: "Staff name", position: "Position", net: "Net salary", status: "Status" };
const LINE_STATUS_LABEL: Record<string, string> = { none: "Data required", draft: "Waiting for payment", paid: "Paid" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "danger" | "warning" | "success" }) {
  const colour = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-text";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-1.5 text-[26px] font-extrabold leading-none tabular-nums ${colour}`}>{value}</div>
      {sub && <div className="mt-2 text-[12.5px] leading-snug text-text-secondary">{sub}</div>}
    </div>
  );
}

/** One place to pay the staff salaries, month by month and company by company: the reference of the Director of Finance. */
export default async function PayrollCentrePage({ searchParams }: { searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // payroll is private: only the Director of Finance and her personal assistant
  if (!(await canUsePayrollCentre(supabase))) return <EmptyRow text="Payroll is private. Only the Director of Finance and her personal assistant can open the Payroll Centre." />;
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { company: requestedId, month: requestedMonth } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  // salaries and bank accounts are for the Finance / Admin level only (also enforced by the database)
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds);
  if (adminIds.length === 0) return <EmptyRow text="The Payroll Centre is only for Super Admin and Company Admin (Finance) users." />;

  const today = todayInMalaysia();
  const month = isValidMonth(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const lines = await loadPayrollLines(supabase, adminIds, month);
  const s = summarisePayroll(lines);
  // the cards count the whole month; the filters and the sort only change the lists of staff below
  const q = sp.q?.trim().toLowerCase() ?? "";
  const { sort, dir } = readSort(sp, SORTS, "name", "asc");
  const shownLines = sortBy(
    lines.filter((l) => (!q || l.fullName.toLowerCase().includes(q)) && (!sp.status || l.status === sp.status)),
    sort,
    dir,
    {
      name: (l) => l.fullName,
      position: [(l) => l.position, (l) => l.fullName],
      net: [(l) => l.netPay, (l) => l.fullName],
      status: [(l) => LINE_STATUS_LABEL[l.status], (l) => l.fullName],
    },
  );

  const [y, m] = month.split("-").map(Number);
  const companyQuery = requestedId ? `&company=${requestedId}` : "";
  const monthLink = (target: string) => `/payroll-centre?month=${target}${companyQuery}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/hr${requestedId ? `?company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-text-secondary hover:text-text print:hidden">
            ← HR
          </Link>
          <h1 className="text-[22px] font-extrabold text-text">Payroll Centre</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {`Staff salary payment for the Director of Finance — ${MONTH_NAMES[m - 1]} ${y}`}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Link href={monthLink(shiftMonth(month, -1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold text-text">
            ← Previous
          </Link>
          <form action="/payroll-centre" className="flex items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-[13px]" />
            {requestedId && <input type="hidden" name="company" value={requestedId} />}
            <button className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white">Go</button>
          </form>
          <Link href={monthLink(shiftMonth(month, 1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-semibold text-text">
            Next →
          </Link>
          <Link href={`/payroll-centre/import?month=${month}${companyQuery}`} className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-white">
            Import Payslips (PDF / Excel)
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net salary this month" value={formatPrice(s.totalNet)} sub={`${s.staff} staff · ${s.staff - s.notEntered} with salary entered`} />
        <StatCard label="Paid" value={formatPrice(s.paidNet)} sub={`${s.paidCount} staff`} tone="success" />
        <StatCard label="Still to pay" value={formatPrice(s.outstandingNet)} sub={`${s.drafts} staff waiting for payment`} tone={s.drafts > 0 ? "warning" : undefined} />
        <StatCard
          label="Needs attention"
          value={s.notEntered + s.missingBank}
          sub={`${s.notEntered} salary not entered · ${s.missingBank} bank details missing`}
          tone={s.notEntered + s.missingBank > 0 ? "danger" : "success"}
        />
      </div>

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={monthLink(month)}>
        <FilterField label="Staff name">
          <input name="q" defaultValue={sp.q ?? ""} className={`${FILTER_INPUT} w-48`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-44`}>
            <option value="">All statuses</option>
            {Object.entries(LINE_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      {lines.length === 0 ? (
        <EmptyRow text="No active staff found for this company." />
      ) : shownLines.length === 0 ? (
        <EmptyRow text="No staff match these filters." />
      ) : (
        <PayrollCentreTable lines={shownLines} month={month} today={today} />
      )}

      <p className="text-[12.5px] text-text-muted print:hidden">
        Each staff record is paid per company. Figures are entered by Finance from the offer letter / payslip; the system never estimates a salary.
      </p>
    </div>
  );
}
