"use server";

import { createClient } from "@/lib/supabase/server";
import { loadHistory } from "@/lib/priority/queries";

const ALLOWED = ["priority_tasks", "finance_payments", "supplier_invoices", "supplier_payments"];

/** The audit trail of a task, payable or payment request (the audit log itself is limited to people with access to the company). */
export async function getHistory(relatedTable: string, relatedId: string) {
  if (!ALLOWED.includes(relatedTable)) throw new Error("History is not available for this record.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return loadHistory(supabase, relatedTable, relatedId);
}

/** Everything recorded about a supplier payable: its own entries and those of its payment requests. */
export async function getPayableHistory(type: "finance_payment" | "supplier_invoice", id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const table = type === "finance_payment" ? "finance_payments" : "supplier_invoices";
  const column = type === "finance_payment" ? "finance_payment_id" : "supplier_invoice_id";
  const { data: ledger } = await supabase.from("supplier_payments").select("id").eq(column, id);
  const ids = (ledger ?? []).map((l) => l.id);
  const filters = [`and(related_table.eq.${table},related_id.eq.${id})`];
  if (ids.length) filters.push(`and(related_table.eq.supplier_payments,related_id.in.(${ids.join(",")}))`);
  const { data, error } = await supabase.from("task_audit_log").select("*").or(filters.join(",")).order("created_at", { ascending: false }).limit(150);
  if (error) throw error;
  const people = Array.from(new Set((data ?? []).map((r) => r.performed_by).filter((x): x is string => !!x)));
  const { data: profiles } = people.length ? await supabase.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name.trim()]));
  return (data ?? []).map((r) => ({ ...r, performerName: r.performed_by ? (names.get(r.performed_by) ?? "—") : "System" }));
}
