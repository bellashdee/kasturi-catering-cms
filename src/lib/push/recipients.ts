import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PushPayload } from "@/lib/push/send";

/** Who gets the phone notification of a new quotation request: Ms. Nabilah and Mr. Adlan only. */
const QUOTATION_REQUEST_NOTIFY = ["296343b8-f5a1-4226-9d0c-41c75c99bf2a", "0cebe546-3d50-44e8-ab51-e23d2082e23d"];

type Row = Record<string, unknown>;
export type PushEvent = { table: string; op: "INSERT" | "UPDATE"; record: Row; old: Row | null };
type Plan = { userIds: string[]; payload: PushPayload } | null;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rm = (v: unknown): string => `RM ${Number(v ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Everybody except the person who did it (they know already). */
const without = (ids: string[], actor: unknown) => ids.filter((id) => id && id !== actor);

async function userIdsWithRole(admin: SupabaseClient, role: string, companyId?: string | null): Promise<string[]> {
  let q = admin.from("user_company_access").select("user_id, company_id").eq("role", role);
  if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  const { data } = await q;
  return [...new Set((data ?? []).map((r: Row) => str(r.user_id)))];
}

const listUserIds = async (admin: SupabaseClient, table: string): Promise<string[]> => {
  const { data } = await admin.from(table).select("user_id");
  return (data ?? []).map((r: Row) => str(r.user_id));
};

/** Who is told about this change, and what the notification says. Anything not listed here sends nothing. */
export async function planPush(event: PushEvent): Promise<Plan> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const r = event.record;
  const old = event.old;

  switch (event.table) {
    case "priority_tasks": {
      const title = str(r.title);
      if (event.op === "INSERT" || (old && old.responsible_id !== r.responsible_id)) {
        // a task given to somebody: only that person is told (not when they made it for themselves)
        return { userIds: without([str(r.responsible_id)], r.created_by), payload: { title: "New task for you", body: title, url: "/priority-centre#tasks", tag: `task-${str(r.id)}` } };
      }
      if (old && old.status !== r.status && r.status === "completed") {
        return { userIds: without([str(r.created_by)], r.completed_by), payload: { title: "Task completed", body: title, url: "/priority-centre#tasks", tag: `task-${str(r.id)}` } };
      }
      return null;
    }

    case "approvals": {
      if (event.op === "UPDATE") {
        if (!old || old.status === r.status || (r.status !== "approved" && r.status !== "rejected")) return null;
        return { userIds: [str(r.requested_by)], payload: { title: `Your request was ${r.status}`, body: str(r.module), url: "/", tag: `approval-${str(r.id)}` } };
      }
      if (r.status !== "pending") return null;
      let what = `Approval waiting for review (${str(r.module)})`;
      let extra: string[] = [];
      const relatedId = str(r.related_id);
      if (str(r.related_table) === "leave_requests" && relatedId) {
        const { data } = await admin.from("leave_requests").select("leave_type, start_date, end_date, employees(full_name)").eq("id", relatedId).maybeSingle();
        const name = ((data as { employees?: { full_name?: string } } | null)?.employees?.full_name ?? "").trim();
        if (data) what = `Leave request${name ? `: ${name}` : ""} (${str((data as Row).start_date)} to ${str((data as Row).end_date)})`;
        // leave is approved by Madam Penny only: she alone is told
        return { userIds: without(await listUserIds(admin, "leave_approvers"), r.requested_by), payload: { title: "Approval waiting", body: what, url: "/priority-centre#approvals", tag: `approval-${str(r.id)}` } };
      } else if (str(r.related_table) === "overtime_records" && relatedId) {
        const { data } = await admin.from("overtime_records").select("hours, work_date, employees(full_name)").eq("id", relatedId).maybeSingle();
        const name = ((data as { employees?: { full_name?: string } } | null)?.employees?.full_name ?? "").trim();
        if (data) what = `OT request${name ? `: ${name}` : ""} (${str((data as Row).work_date)}, ${String((data as Row).hours ?? "")} h)`;
        extra = await listUserIds(admin, "ot_approvers");
      }
      const ids = [...(await userIdsWithRole(admin, "super_admin")), ...(await userIdsWithRole(admin, "company_admin", str(r.company_id) || null)), ...extra];
      return { userIds: without(ids, r.requested_by), payload: { title: "Approval waiting", body: what, url: "/priority-centre#approvals", tag: `approval-${str(r.id)}` } };
    }

    case "payment_proof_submissions": {
      const ids = [...(await userIdsWithRole(admin, "super_admin")), ...(await userIdsWithRole(admin, "company_admin", str(r.company_id) || null))];
      const invoice = str(r.invoice_number);
      return { userIds: ids, payload: { title: "Payment proof received", body: `${invoice ? `${invoice} · ` : ""}${rm(r.amount)}${str(r.sales_agent) ? ` · ${str(r.sales_agent)}` : ""}`, url: "/finance/payment-proofs", tag: `proof-${str(r.id)}` } };
    }

    case "quotation_requests": {
      // only Ms. Nabilah and Mr. Adlan are told of a new quotation request (the inbox itself stays open to everyone with access)
      const ids = QUOTATION_REQUEST_NOTIFY;
      const code = str(r.request_code);
      return { userIds: ids, payload: { title: `New quotation request${code ? ` ${code}` : ""}`, body: [str(r.customer_name), str(r.event_name)].filter(Boolean).join(" · "), url: `/catering/quotation-requests/${str(r.id)}`, tag: `qr-${str(r.id)}` } };
    }

    case "petty_cash_transactions": {
      // a staff member paid with their own money and claims it back: Ms. Penny and Ms. Nabilah (who see everybody's petty cash) pay it
      if (r.type !== "expense" || r.payment_status !== "pending_payment" || !(r.claimant_employee_id || str(r.claimant_name))) return null;
      const { data } = await admin.from("operation_petty_cash_access").select("user_id").eq("can_see_all", true);
      const ids = (data ?? []).map((x: Row) => str(x.user_id));
      return { userIds: without(ids, r.created_by), payload: { title: "Staff claim to pay", body: `${str(r.claimant_name) || "A staff member"} · ${rm(r.amount)}${str(r.description) ? ` · ${str(r.description)}` : ""}`, url: "/spending/petty-cash", tag: `claim-${str(r.id)}` } };
    }

    case "bulletin_posts": {
      // everybody who can open the company of the post (a post of no company is for everybody)
      const companyId = str(r.company_id);
      let q = admin.from("user_company_access").select("user_id");
      if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
      const { data } = await q;
      const ids = [...new Set((data ?? []).map((x: Row) => str(x.user_id)))];
      return { userIds: without(ids, r.created_by), payload: { title: str(r.title) || "Bulletin Board", body: str(r.body).slice(0, 140), url: "/bulletin", tag: `bulletin-${str(r.id)}` } };
    }

    default:
      return null;
  }
}
