import { createAdminClient } from "@/lib/supabase/admin";
import { HISTORY_LABEL } from "@/lib/hr/changeFields";
import { formatMalaysiaDate } from "@/lib/format";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { MyDetailsEdit } from "@/components/hr/MyDetailsEdit";

/** My Profile: a staff member changes their own details here. */
export function MyDetailsCard({ employeeId }: { employeeId: string }) {
  return (
    <SectionCard title="Change my details">
      <p className="mb-4 text-[13.5px] text-text-secondary">Choose the detail and write what it should be. It is saved straight away, and every change is recorded with your name. Only Madam Penny and Nabilah can read the edit history.</p>
      <MyDetailsEdit employeeId={employeeId} />
    </SectionCard>
  );
}

const when = (iso: string) => {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
  return `${formatMalaysiaDate(iso.slice(0, 10))} ${time}`;
};

/** Who changed which detail of the staff record, when, and from what to what (all the company records of the person together). Shown only to Madam Penny and Nabilah. */
export async function EditHistoryCard({ employeeIds }: { employeeIds: string[] }) {
  const { data } = await createAdminClient().from("employee_edit_history").select("*").in("employee_id", employeeIds.length > 0 ? employeeIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  return (
    <SectionCard title="Edit History (who changed what)">
      {rows.length === 0 ? (
        <EmptyRow text="No detail has been changed yet." />
      ) : (
        <div className="-mx-5 -mb-5 divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="px-5 py-3 text-[13.5px]">
              <div className="font-semibold text-text">{HISTORY_LABEL[r.field] ?? r.field}</div>
              <div className="text-text-secondary">{`${r.old_value ?? "—"} → ${r.new_value ?? "—"}`}</div>
              <div className="text-[12.5px] text-text-muted">{`${r.edited_by_name} · ${when(r.created_at)}`}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
