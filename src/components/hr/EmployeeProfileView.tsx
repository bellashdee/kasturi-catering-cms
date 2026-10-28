import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SessionContext } from "@/lib/auth";
import { OT_STATUS_LABEL } from "@/lib/hr/overtime";
import {
  getEmployeePrivateDetails,
  listLeaveForEmployee,
  listOvertimeForEmployee,
  listPayrollForEmployee,
  type EmployeeWithCompany,
} from "@/lib/hr/queries";
import {
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  PAYROLL_STATUS_LABEL,
  certificateUrgency,
  canManageStaffPrivateDetails,
  STAFF_LETTER_TYPES,
} from "@/lib/hr/constants";
import { likeExact } from "@/lib/pettyCash/people";
import { EditHistoryCard } from "@/components/hr/EditHistoryCards";
import { formatCurrency } from "@/lib/format";
import { dobFromIc } from "@/lib/hr/ic";
import { shortNameOf } from "@/lib/hr/shortName";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import type { HrAccess } from "@/lib/hr/access";
import { CertificateList } from "@/components/hr/CertificateList";
import { LeaveItem } from "@/components/hr/LeaveItem";

/**
 * Everything about one staff member: the staff information, documents and certificates, leave, overtime and (only for the people who may
 * see payroll) payroll. It is the profile page of the HR section and also the "My Profile" page of every staff member.
 */
export async function EmployeeProfileView({
  employee,
  access,
  session,
  supabase,
  query,
  backHref,
}: {
  employee: EmployeeWithCompany;
  access: HrAccess;
  session: SessionContext;
  supabase: SupabaseClient<Database>;
  query: string;
  /** a link back to the Employee Database (left out on My Profile) */
  backHref?: string;
}) {
  const id = employee.id;
  const canSeePrivate = canManageStaffPrivateDetails(session.role);
  const canSeePayroll = await canUsePayrollCentre(supabase);
  const isAdmin = access.isAdminOf(employee.company_id);
  // the same person can have a staff record in each company he or she works for: all of them are shown together
  const { data: sameName } = await supabase.from("employees").select("*, companies(name)").ilike("full_name", likeExact(employee.full_name)).order("created_at");
  const records = (sameName ?? []).filter((r) => r.id === employee.id || access.canSee(r));
  const recordIds = records.map((r) => r.id);
  const [{ data: allCertificates }, leave, overtime, payroll, privateDetails] = await Promise.all([
    supabase.from("employee_certificates").select("*").in("employee_id", recordIds.length > 0 ? recordIds : [id]).order("expiry_date", { ascending: true }),
    listLeaveForEmployee(supabase, id),
    listOvertimeForEmployee(supabase, id),
    canSeePayroll ? listPayrollForEmployee(supabase, id) : Promise.resolve([]),
    canSeePrivate ? getEmployeePrivateDetails(supabase, id) : Promise.resolve(null),
  ]);

  const restricted = "Restricted (Admin only)";
  const bankValue = !canSeePrivate
    ? restricted
    : [privateDetails?.bank_name, privateDetails?.bank_account_no].filter(Boolean).join(" · ") || "—";
  // the date of birth written on the staff record; for a Malaysian IC number it is also known from the number itself
  const dobText = employee.date_of_birth || dobFromIc(employee.ic_passport_no) || "—";
  const kwspValue = !canSeePrivate ? restricted : privateDetails?.epf_no || "—";
  const toItem = (c: NonNullable<typeof allCertificates>[number]) => ({
    id: c.id,
    companyId: c.company_id,
    certType: c.cert_type,
    certName: c.cert_name,
    certNumber: c.cert_number,
    issuedDate: c.issued_date,
    expiryDate: c.expiry_date,
    documentId: c.document_id,
    urgency: certificateUrgency(c.expiry_date),
  });
  const letters = (allCertificates ?? []).filter((c) => STAFF_LETTER_TYPES.includes(c.cert_type));
  const documents = (allCertificates ?? []).filter((c) => !STAFF_LETTER_TYPES.includes(c.cert_type));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          {backHref && (
            <Link href={backHref} className="text-[12.5px] font-semibold text-text-secondary">
              ← Back to Employee Database
            </Link>
          )}
          <div className={`${backHref ? "mt-2 " : ""}flex items-center gap-3`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-base font-bold text-white">
              {employee.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-[20px] font-extrabold text-text">{employee.full_name}</div>
              <div className="text-[13px] text-text-secondary">
                {employee.position || "—"} · {employee.department || "—"} · {employee.companies?.name}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={employee.status === "active" ? "success" : employee.status === "terminated" ? "danger" : "neutral"}>
            {EMPLOYEE_STATUS_LABEL[employee.status] ?? employee.status}
          </StatusBadge>
          {isAdmin && (
            <Link href={`/hr/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
              Edit
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Staff Information">
          <StatRow label="Name" value={employee.full_name} />
          <StatRow label="IC Number / Passport No." value={employee.ic_passport_no || "—"} />
          <StatRow label="Date of Birth (from IC number)" value={dobText} />
          <StatRow label="Nationality" value={employee.nationality || "—"} />
          <StatRow label="Gender" value={employee.gender || "—"} />
          <StatRow label="Race" value={employee.race || "—"} />
          <StatRow label="Religion" value={employee.religion || "—"} />
          <StatRow label="Marital Status" value={employee.marital_status || "—"} />
          <StatRow label="Branch" value={employee.branch || "—"} />
          <StatRow label="Short Name" value={shortNameOf(employee.full_name, employee.short_name)} />
          <StatRow label="Mobile No." value={employee.phone || "—"} />
          <StatRow label="Email" value={employee.email || "—"} />
          <StatRow label="Start Date" value={employee.join_date || "—"} />
          <StatRow label="Position" value={employee.position || "—"} />
          <StatRow label="Bank Name & A/C No." value={bankValue} />
          <StatRow label="KWSP No." value={kwspValue} />
          <StatRow label="Department" value={employee.department || "—"} />
          <StatRow label="Employment Type" value={EMPLOYMENT_TYPE_LABEL[employee.employment_type] ?? employee.employment_type} />
        </SectionCard>

        <SectionCard
          title="Staff Documents & Certificates"
          action={isAdmin ? <Link href={`/hr/${id}/certificates/new${query}`} className="text-[12.5px] font-semibold text-primary">+ Upload</Link> : undefined}
        >
          {documents.length === 0 ? <EmptyRow text="No certificates on file yet." /> : <CertificateList canEdit={isAdmin} items={documents.map(toItem)} />}
        </SectionCard>

        <SectionCard
          title="Warning Letters & Notices"
          action={isAdmin ? <Link href={`/hr/${id}/certificates/new${query}`} className="text-[12.5px] font-semibold text-primary">+ Add letter</Link> : undefined}
        >
          {letters.length === 0 ? <EmptyRow text="No warning letter or notice on file." /> : <CertificateList canEdit={isAdmin} items={letters.map(toItem)} />}
        </SectionCard>

        <SectionCard title="All Company Information">
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="px-5 py-3.5 text-[13.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-text">{r.companies?.name ?? "—"}</div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={r.status === "active" ? "success" : r.status === "terminated" ? "danger" : "neutral"}>{EMPLOYEE_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                    {r.id !== employee.id && access.canSee(r) && (
                      <Link href={`/hr/${r.id}${query}`} className="text-[12.5px] font-semibold text-primary hover:underline">Open record →</Link>
                    )}
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] text-text-secondary">
                  <span>{`Position: ${r.position || "—"}`}</span>
                  <span>{`Department: ${r.department || "—"}`}</span>
                  <span>{`Type: ${EMPLOYMENT_TYPE_LABEL[r.employment_type] ?? r.employment_type}`}</span>
                  <span>{`Start date: ${r.join_date || "—"}`}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Leave" action={<Link href={`/hr/${id}/leave/new${query}`} className="text-[12.5px] font-semibold text-primary">+ Request</Link>}>
          {leave.length === 0 ? (
            <EmptyRow text="No leave requests yet." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {leave.slice(0, 5).map((l) => (
                <LeaveItem
                  key={l.id}
                  compact
                  canDecide={access.isAdminOf(employee.company_id)}
                  canChange={access.isAdminOf(employee.company_id) || (access.ownEmployeeIds.has(employee.id) && l.status === "pending")}
                  leave={{ id: l.id, employeeId: l.employee_id, leaveType: l.leave_type, leaveTypeOther: l.leave_type_other, startDate: l.start_date, endDate: l.end_date, days: Number(l.days), reason: l.reason, status: l.status, documentId: l.document_id }}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Overtime" action={<Link href={`/hr/overtime/new?employee=${id}`} className="text-[12.5px] font-semibold text-primary">+ OT Form</Link>}>
          {overtime.length === 0 ? (
            <EmptyRow text="No overtime logged yet." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {overtime.slice(0, 5).map((o) => (
                <Link key={o.id} href={`/hr/overtime/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-bg">
                  <div>
                    <div className="text-[13px] font-semibold text-text">{o.work_date}</div>
                    <div className="text-xs text-text-muted">{o.reason || "No reason given"} · {OT_STATUS_LABEL[o.status] ?? o.status}</div>
                  </div>
                  <div className="text-[13px] font-bold text-text">{o.hours}h</div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        {isAdmin && (
          <div className="col-span-2">
            <EditHistoryCard employeeIds={recordIds} />
          </div>
        )}

        {canSeePayroll && (
        <SectionCard title="Payroll" action={<Link href={`/hr/${id}/payroll/new${query}`} className="text-[12.5px] font-semibold text-primary">+ Add Record</Link>}>
          {payroll.length === 0 ? (
            <EmptyRow text="No payroll records yet." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {payroll.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-[13px] font-semibold text-text">{p.pay_period_start} → {p.pay_period_end}</div>
                    <div className="text-xs text-text-muted">Net {formatCurrency(p.net_pay)}</div>
                  </div>
                  <StatusBadge tone={p.status === "paid" ? "success" : "neutral"}>
                    {PAYROLL_STATUS_LABEL[p.status] ?? p.status}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        )}
      </div>
    </div>
  );
}
