"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type AuditLogInput = {
  companyId: string;
  relatedTable: string;
  relatedId: string;
  action: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
};

/**
 * Generic audit trail — any module logs into the same table via
 * (relatedTable, relatedId), so history for a delivery, an attendance
 * record, or a future Kitchen/Catering task all live in one auditable place.
 */
export async function logTaskAudit(input: AuditLogInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("task_audit_log").insert({
    company_id: input.companyId,
    related_table: input.relatedTable,
    related_id: input.relatedId,
    action: input.action,
    performed_by: userId,
    previous_value: input.previousValue || null,
    new_value: input.newValue || null,
    reason: input.reason || null,
  });
  if (error) throw error;
}

export type AttachTaskProofInput = {
  companyId: string;
  relatedTable: string;
  relatedId: string;
  documentId: string;
  proofType: string;
  remarks?: string;
  revalidatePaths?: string[];
};

export async function attachTaskProof(input: AttachTaskProofInput) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("task_proofs").insert({
    company_id: input.companyId,
    related_table: input.relatedTable,
    related_id: input.relatedId,
    document_id: input.documentId,
    proof_type: input.proofType,
    remarks: input.remarks || null,
    uploaded_by: userId,
  });
  if (error) throw error;

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: input.relatedTable,
    relatedId: input.relatedId,
    action: "proof_uploaded",
    newValue: input.proofType,
  });

  for (const path of input.revalidatePaths ?? []) revalidatePath(path);
}

export type DeleteTaskProofInput = {
  companyId: string;
  relatedTable: string;
  relatedId: string;
  revalidatePaths?: string[];
};

export async function deleteTaskProof(proofId: string, input: DeleteTaskProofInput) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("task_proofs").delete().eq("id", proofId);
  if (error) throw error;

  await logTaskAudit({
    companyId: input.companyId,
    relatedTable: input.relatedTable,
    relatedId: input.relatedId,
    action: "proof_deleted",
  });

  for (const path of input.revalidatePaths ?? []) revalidatePath(path);
}
