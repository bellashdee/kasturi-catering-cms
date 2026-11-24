import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { formatMalaysiaDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { ClaimDecision } from "@/components/hr/ClaimHoursControls";

type Row = {
  id: string;
  company_id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  approved_hours: number | null;
  reason: string;
  status: string;
  manager_remarks: string | null;
  employees: { full_name: string; position: string | null; user_id: string | null } | null;
  companies: { name: string } | null;
};
const TONE: Record<string, "warning" | "success" | "danger"> = { pending: "warning", approved: "success", rejected: "danger" };
const n = (v: number) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(2).replace(/\.?0+$/, ""));

/** HR → Claim Hours: the extra hours claimed by staff of RM4,000 and above (who cannot claim OT), for the OT approvers to approve. */
export default async function ClaimHoursApprovalPage({ searchParams }: { searchParams: Promise<{ company?: string; status?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const { company: requestedId, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const status = ["pending", "approved", "rejected", "all"].includes(statusParam ?? "") ? statusParam! : "pending";

  let q = untyped(supabase)
    .from("claim_hours")
    .select("id, company_id, employee_id, work_date, start_time, end_time, hours, approved_hours, reason, status, manager_remarks, employees(full_name, position, user_id), companies(name)")
    .in("company_id", targetCompanyIds)
    .order("work_date", { ascending: false })
    .limit(500);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const companyQ = requestedId ? `&company=${requestedId}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/hr/overtime${requestedId ? `?company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-text-secondary">← Overtime</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Claim Hours</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Staff with a salary of RM4,000 and above cannot claim OT: they claim the extra hours, and every 8 approved hours = 1 day of replacement leave.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <Link key={s} href={`/hr/claim-hours?status=${s}${companyQ}`} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold capitalize ${status === s ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
            {s === "pending" ? "Waiting approval" : s}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyRow text={status === "pending" ? "No claim hours waiting for approval." : "No claim hours here."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[900px] text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-2.5">Staff</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5 text-right">Hours</th>
                <th className="px-3 py-2.5">Work</th>
                <th className="px-5 py-2.5">Status / decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-2.5">
                    <div className="font-semibold text-text">{r.employees?.full_name}</div>
                    <div className="text-[12px] text-text-muted">{[r.employees?.position, r.companies?.name].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-3 py-2.5">{formatMalaysiaDate(r.work_date)}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{n(Number(r.approved_hours ?? r.hours))}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{r.reason}{r.manager_remarks && <div className="text-[12px] text-text-muted">Remarks: {r.manager_remarks}</div>}</td>
                  <td className="px-5 py-2.5">
                    {r.status === "pending" && r.employees?.user_id !== session.userId ? (
                      <ClaimDecision id={r.id} hours={Number(r.hours)} />
                    ) : (
                      <StatusBadge tone={TONE[r.status] ?? "neutral"}>{r.status === "pending" ? "Waiting approval" : r.status === "approved" ? "Approved" : "Rejected"}</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
