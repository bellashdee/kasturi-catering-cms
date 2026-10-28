import { createAdminClient } from "@/lib/supabase/admin";
import { changeFieldByKey, CHANGE_STATUS_LABEL } from "@/lib/hr/changeFields";
import { malaysiaDateOf } from "@/lib/format";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { CancelRequestButton, DecideChangeButtons, RequestChangeForm } from "@/components/hr/ChangeRequestControls";

const labelOf = (field: string) => changeFieldByKey(field)?.label ?? field;

/** My Profile: a staff member cannot change their own details, they ask for a change here and follow the answer. */
export async function MyChangeRequests({ employeeId, userId }: { employeeId: string; userId: string }) {
  const { data } = await createAdminClient().from("employee_change_requests").select("*").eq("requested_by", userId).order("created_at", { ascending: false }).limit(20);
  const requests = data ?? [];
  return (
    <SectionCard title="Request a change of my details">
      <p className="mb-4 text-[13.5px] text-text-secondary">
        Your details can only be changed by Madam Penny or Nabilah. If something is wrong or has changed, ask here: they will check it and approve it, and your record is then changed.
      </p>
      <RequestChangeForm employeeId={employeeId} />
      {requests.length > 0 && (
        <div className="mt-5 divide-y divide-border rounded-xl border border-border">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-[13.5px]">
              <div className="min-w-0">
                <div className="font-semibold text-text">{labelOf(r.field)}</div>
                <div className="text-text-secondary">{`${r.old_value || "—"} → ${r.new_value}`}</div>
                {r.reason && <div className="text-[12.5px] text-text-muted">{`Why: ${r.reason}`}</div>}
                {r.status === "rejected" && r.decision_note && <div className="text-[12.5px] text-danger">{`Answer: ${r.decision_note}`}</div>}
                <div className="text-[12px] text-text-muted">{malaysiaDateOf(r.created_at)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{CHANGE_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                {r.status === "pending" && <CancelRequestButton id={r.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** HR page, for Madam Penny and Nabilah: the changes the staff asked for, waiting for their answer. */
export async function PendingChangeRequests() {
  const admin = createAdminClient();
  const { data } = await admin.from("employee_change_requests").select("*").eq("status", "pending").order("created_at", { ascending: true });
  const requests = data ?? [];
  const ids = Array.from(new Set(requests.map((r) => r.employee_id)));
  const { data: people } = ids.length > 0 ? await admin.from("employees").select("id, full_name, companies(name)").in("id", ids) : { data: [] as { id: string; full_name: string; companies: { name: string } | null }[] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return (
    <div id="change-requests" className="scroll-mt-24">
      <SectionCard title={`Staff change requests${requests.length > 0 ? ` (${requests.length} waiting)` : ""}`}>
        {requests.length === 0 ? (
          <EmptyRow text="No staff is waiting for an answer." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {requests.map((r) => {
              const person = byId.get(r.employee_id);
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[13.5px]">
                  <div className="min-w-0">
                    <div className="font-bold text-text">{`${person?.full_name ?? "—"} · ${person?.companies?.name ?? ""}`}</div>
                    <div className="text-text">{`${labelOf(r.field)}: ${r.old_value || "—"} → ${r.new_value}`}</div>
                    {r.reason && <div className="text-[12.5px] text-text-muted">{`Why: ${r.reason}`}</div>}
                    <div className="text-[12px] text-text-muted">{malaysiaDateOf(r.created_at)}</div>
                  </div>
                  <DecideChangeButtons id={r.id} />
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
