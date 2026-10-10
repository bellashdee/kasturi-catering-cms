import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { OT_STATUS_LABEL } from "@/lib/hr/overtime";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  getEmployee,
  getEmployeePrivateDetails,
  getProfileNames,
  listAttendanceForEmployee,
  listCertificates,
  listClaimsForEmployee,
  listEmployeeDocuments,
  listEmploymentHistory,
  listLeaveForEmployee,
  listOvertimeForEmployee,
  listPayrollForEmployee,
} from "@/lib/hr/queries";
import {
  ATTENDANCE_STATUS_LABEL,
  CERT_TYPE_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  HISTORY_EVENT_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_TYPE_LABEL,
  PAYROLL_STATUS_LABEL,
  PROBATION_OUTCOME_LABEL,
  certificateUrgency,
  employeeStatusLabel,
  employeeStatusTone,
} from "@/lib/hr/constants";
import { getEmployeeViewer, SECTION_LABEL, visibleSections } from "@/lib/hr/permissions";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { EmploymentActions } from "@/components/hr/EmploymentActions";
import { EmployeeDocuments } from "@/components/hr/EmployeeDocuments";
import { PhotoUpload } from "@/components/hr/PhotoUpload";

const CERT_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  no_expiry: "neutral",
  valid: "success",
  expiring_soon: "warning",
  expired: "danger",
};
const CERT_LABEL: Record<string, string> = { no_expiry: "On file", valid: "Valid", expiring_soon: "Expiring Soon", expired: "Expired" };

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string; tab?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId, tab: requestedTab } = await searchParams;
  const query = requestedId ? `company=${requestedId}` : "";

  const supabase = await createClient();

  let employee;
  try {
    employee = await getEmployee(supabase, id);
  } catch {
    notFound();
  }

  const viewer = await getEmployeeViewer(supabase, employee);
  const sections = visibleSections(viewer);
  const tab = requestedTab && sections.includes(requestedTab) ? requestedTab : "overview";
  const tabHref = (t: string) => `/hr/${id}?${[query, `tab=${t}`].filter(Boolean).join("&")}`;

  // Names for department, manager and the photo.
  const [deptRes, managerRes, photoRes] = await Promise.all([
    employee.department_id ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle() : Promise.resolve({ data: null }),
    employee.reporting_manager_id ? supabase.from("employees").select("full_name").eq("id", employee.reporting_manager_id).maybeSingle() : Promise.resolve({ data: null }),
    employee.photo_path ? supabase.storage.from("hr-documents").createSignedUrl(employee.photo_path, 300) : Promise.resolve({ data: null }),
  ]);
  const departmentName = deptRes.data?.name ?? employee.department;
  const managerName = managerRes.data?.full_name ?? null;
  const photoUrl = photoRes.data?.signedUrl ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href={`/hr${query ? `?${query}` : ""}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Employee Directory
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex flex-col items-center">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={`${employee.full_name} profile photo`} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-base font-bold text-white" aria-hidden="true">
                  {employee.full_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              {viewer.isHr && <PhotoUpload employeeId={id} companyId={employee.company_id} />}
            </div>
            <div>
              <div className="text-[20px] font-extrabold text-text">{employee.full_name}</div>
              <div className="text-[13px] text-text-secondary">
                {dash(employee.position)} · {dash(departmentName)} · {employee.companies?.name}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={employeeStatusTone(employee.status, employee.employment_stage)}>
            {employeeStatusLabel(employee.status, employee.employment_stage)}
          </StatusBadge>
          {viewer.isHr && (
            <Link href={`/hr/${id}/edit${query ? `?${query}` : ""}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
              Edit
            </Link>
          )}
        </div>
      </div>

      {viewer.isHr && (
        <EmploymentActions
          employeeId={id}
          employeeName={employee.full_name}
          status={employee.status}
          stage={employee.employment_stage}
          probationEnd={employee.probation_end}
        />
      )}

      <nav aria-label="Profile sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {sections.map((s) => (
          <Link
            key={s}
            href={tabHref(s)}
            aria-current={tab === s ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold ${tab === s ? "border-b-2 border-primary text-primary" : "text-text-secondary hover:text-text"}`}
          >
            {SECTION_LABEL[s]}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard title="Personal Information">
            <StatRow label="Full name" value={employee.full_name} />
            <StatRow label="Employee ID" value={dash(employee.employee_no)} />
            <StatRow label="Mobile no." value={dash(employee.phone)} />
            <StatRow label="Email" value={dash(employee.email)} />
          </SectionCard>
          <SectionCard title="Employment Information">
            <StatRow label="Company" value={employee.companies?.name ?? "—"} />
            <StatRow label="Department" value={dash(departmentName)} />
            <StatRow label="Job title" value={dash(employee.position)} />
            <StatRow label="Employment type" value={EMPLOYMENT_TYPE_LABEL[employee.employment_type] ?? employee.employment_type} />
            <StatRow label="Reporting manager" value={dash(managerName)} />
            <StatRow label="Start date" value={dash(employee.join_date)} />
            <StatRow label="Probation" value={employee.probation_start || employee.probation_end ? `${dash(employee.probation_start)} → ${dash(employee.probation_end)}` : "—"} />
            <StatRow label="Confirmation date" value={dash(employee.confirmation_date)} />
            {employee.employment_type === "contract" && <StatRow label="Contract end" value={dash(employee.contract_end)} />}
            {employee.resign_date && <StatRow label="Last working / exit date" value={employee.resign_date} />}
          </SectionCard>
        </div>
      )}

      {tab === "contact" && <ContactSection supabase={supabase} employeeId={id} />}

      {tab === "documents" && (
        <div className="flex flex-col gap-5">
          <SectionCard title="HR Documents (letters, contracts)">
            <EmployeeDocuments employeeId={id} companyId={employee.company_id} docs={await listEmployeeDocuments(supabase, id)} canManage={viewer.isHr} />
          </SectionCard>
          <CertificatesSection supabase={supabase} employeeId={id} canUpload={viewer.isHr} query={query} />
        </div>
      )}

      {tab === "history" && <HistorySection supabase={supabase} employeeId={id} />}

      {tab === "leave" && <LeaveSection supabase={supabase} employeeId={id} canRequest={viewer.isHr} query={query} />}

      {tab === "attendance" && <AttendanceSection supabase={supabase} employeeId={id} />}

      {tab === "claims" && <ClaimsSection supabase={supabase} employeeId={id} />}

      {tab === "payroll" && <PayrollSection supabase={supabase} employeeId={id} canAdd={viewer.isHr} query={query} />}
    </div>
  );
}

type Supa = Awaited<ReturnType<typeof createClient>>;

async function ContactSection({ supabase, employeeId }: { supabase: Supa; employeeId: string }) {
  const details = await getEmployeePrivateDetails(supabase, employeeId);
  if (!details) return <SectionCard title="Contact & Emergency Details"><EmptyRow text="No restricted details are on file, or you don't have access to them." /></SectionCard>;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <SectionCard title="Identification & Address">
        <StatRow label="IC / passport no." value={dash(details.ic_passport_no)} />
        <StatRow label="Residential address" value={dash(details.residential_address)} />
      </SectionCard>
      <SectionCard title="Emergency Contact">
        <StatRow label="Name" value={dash(details.emergency_contact_name)} />
        <StatRow label="Relationship" value={dash(details.emergency_contact_relationship)} />
        <StatRow label="Phone" value={dash(details.emergency_contact_phone)} />
      </SectionCard>
      <SectionCard title="Bank & KWSP">
        <StatRow label="Bank" value={dash(details.bank_name)} />
        <StatRow label="Account no." value={dash(details.bank_account_no)} />
        <StatRow label="KWSP no." value={dash(details.epf_no)} />
      </SectionCard>
    </div>
  );
}

async function CertificatesSection({ supabase, employeeId, canUpload, query }: { supabase: Supa; employeeId: string; canUpload: boolean; query: string }) {
  const certificates = await listCertificates(supabase, employeeId);
  return (
    <SectionCard
      title="Certificates & Licences"
      action={canUpload ? <Link href={`/hr/${employeeId}/certificates/new${query ? `?${query}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ Upload</Link> : undefined}
    >
      {certificates.length === 0 ? (
        <EmptyRow text="No certificates on file yet." />
      ) : (
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {certificates.map((c) => {
            const urgency = certificateUrgency(c.expiry_date);
            return (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">{CERT_TYPE_LABEL[c.cert_type] ?? c.cert_name}</div>
                  <div className="text-xs text-text-muted">{c.cert_name} · {c.expiry_date ? `expires ${c.expiry_date}` : "no expiry"}</div>
                </div>
                <StatusBadge tone={CERT_TONE[urgency]}>{CERT_LABEL[urgency]}</StatusBadge>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

async function HistorySection({ supabase, employeeId }: { supabase: Supa; employeeId: string }) {
  const history = await listEmploymentHistory(supabase, employeeId);
  const names = await getProfileNames(supabase, history.map((h) => h.recorded_by ?? ""));
  return (
    <SectionCard title="Employment History">
      {history.length === 0 ? (
        <EmptyRow text="No employment events recorded yet." />
      ) : (
        <ol className="-mx-5 -mb-5 divide-y divide-border">
          {history.map((h) => (
            <li key={h.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13.5px] font-semibold text-text">
                  {HISTORY_EVENT_LABEL[h.event_type] ?? h.event_type}
                  {h.outcome && <span className="ml-2 font-normal text-text-secondary">— {PROBATION_OUTCOME_LABEL[h.outcome] ?? h.outcome}</span>}
                </div>
                <div className="text-xs text-text-muted">Effective {h.effective_date}</div>
              </div>
              {(h.from_status || h.to_status) && (
                <div className="text-xs text-text-secondary">{dash(h.from_status)} → {dash(h.to_status)}</div>
              )}
              {h.details && <div className="mt-1 text-[13px] text-text-secondary">{h.details}</div>}
              <div className="mt-1 text-[11.5px] text-text-muted">
                Recorded {formatMalaysiaDate(h.created_at)}{h.recorded_by ? ` by ${names.get(h.recorded_by) ?? "a user"}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

async function LeaveSection({ supabase, employeeId, canRequest, query }: { supabase: Supa; employeeId: string; canRequest: boolean; query: string }) {
  const leave = await listLeaveForEmployee(supabase, employeeId);
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).slice(0, 4);
  const approvedDays = leave.filter((l) => l.status === "approved" && l.start_date.startsWith(year)).reduce((sum, l) => sum + Number(l.days), 0);
  const pending = leave.filter((l) => l.status === "pending").length;
  return (
    <SectionCard
      title="Leave Summary"
      action={canRequest ? <Link href={`/hr/${employeeId}/leave/new${query ? `?${query}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ Request</Link> : undefined}
    >
      <StatRow label={`Approved leave days in ${year}`} value={approvedDays} />
      <StatRow label="Requests awaiting a decision" value={pending} />
      <p className="mb-3 text-[11.5px] text-text-muted">Counted from leave requests. Entitlement and balance tracking is not set up yet (leave policies are still to be configured).</p>
      {leave.length === 0 ? (
        <EmptyRow text="No leave requests yet." />
      ) : (
        <div className="-mx-5 -mb-5 divide-y divide-border border-t border-border">
          {leave.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-[13px] font-semibold text-text">{LEAVE_TYPE_LABEL[l.leave_type] ?? l.leave_type}</div>
                <div className="text-xs text-text-muted">{l.start_date} → {l.end_date} · {l.days} day(s)</div>
              </div>
              <StatusBadge tone={l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "warning"}>
                {LEAVE_STATUS_LABEL[l.status] ?? l.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

async function AttendanceSection({ supabase, employeeId }: { supabase: Supa; employeeId: string }) {
  const [attendance, overtime] = await Promise.all([listAttendanceForEmployee(supabase, employeeId), listOvertimeForEmployee(supabase, employeeId)]);
  const counts = attendance.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <SectionCard title="Attendance Summary (last 30 records)">
        {attendance.length === 0 ? (
          <EmptyRow text="No attendance records yet." />
        ) : (
          <>
            {Object.entries(counts).map(([status, n]) => (
              <StatRow key={status} label={ATTENDANCE_STATUS_LABEL[status] ?? status} value={n} />
            ))}
            <div className="-mx-5 -mb-5 mt-3 divide-y divide-border border-t border-border">
              {attendance.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="text-text">{a.work_date}</span>
                  <span className="text-text-muted">{a.check_in ?? "—"} – {a.check_out ?? "—"}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
      <SectionCard title="Overtime">
        {overtime.length === 0 ? (
          <EmptyRow text="No overtime logged yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {overtime.slice(0, 5).map((o) => (
              <Link key={o.id} href={`/hr/overtime/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-bg">
                <div>
                  <div className="text-[13px] font-semibold text-text">{o.work_date}</div>
                  <div className="text-xs text-text-muted">{OT_STATUS_LABEL[o.status] ?? o.status}</div>
                </div>
                <div className="text-[13px] font-bold text-text">{o.hours}h</div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

async function ClaimsSection({ supabase, employeeId }: { supabase: Supa; employeeId: string }) {
  const claims = await listClaimsForEmployee(supabase, employeeId);
  return (
    <SectionCard title="Claims Summary">
      {claims.length === 0 ? (
        <EmptyRow text="No claims recorded for this employee." />
      ) : (
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {claims.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-[13px] font-semibold text-text">{c.category || "Claim"}</div>
                <div className="text-xs text-text-muted">{c.transaction_date}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-text">{formatCurrency(Number(c.amount))}</span>
                <StatusBadge tone={c.payment_status === "paid" ? "success" : "warning"}>{c.payment_status ?? "pending"}</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

async function PayrollSection({ supabase, employeeId, canAdd, query }: { supabase: Supa; employeeId: string; canAdd: boolean; query: string }) {
  const payroll = await listPayrollForEmployee(supabase, employeeId);
  return (
    <SectionCard
      title="Payroll Summary"
      action={canAdd ? <Link href={`/hr/${employeeId}/payroll/new${query ? `?${query}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ Add Record</Link> : undefined}
    >
      {payroll.length === 0 ? (
        <EmptyRow text="No payroll records yet." />
      ) : (
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {payroll.slice(0, 6).map((p) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="text-[13px] font-semibold text-text">{p.pay_period_start} → {p.pay_period_end}</div>
                <div className="text-xs text-text-muted">Net {formatCurrency(p.net_pay)}</div>
              </div>
              <StatusBadge tone={p.status === "paid" ? "success" : "neutral"}>{PAYROLL_STATUS_LABEL[p.status] ?? p.status}</StatusBadge>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
