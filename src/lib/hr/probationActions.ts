"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { ensureDocumentMarkdown } from "@/lib/documents/markdown";
import {
  addDays,
  confirmationLetterText,
  extensionLetterText,
  formatShortDate,
  parseLetterDate,
  parseOfferLetter,
  probationEndDate,
  sameNameWords,
  type LetterContext,
  type OfferLetterData,
} from "@/lib/hr/probation";
import { todayInMalaysia } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireAdmin(message = "Only Madam Penny or Nabilah can manage probation.") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data } = await supabase.rpc("current_user_is_super_admin");
  if (data !== true) throw new Error(message);
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return { supabase, userId: user.id, userName: profile?.full_name?.trim() || "Unknown" };
}

async function getProbation(supabase: Supabase, probationId: string) {
  const { data, error } = await supabase.from("employee_probation").select("*").eq("id", probationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This probation record was not found.");
  return data;
}

async function getEvent(supabase: Supabase, eventId: string) {
  const { data, error } = await supabase.from("employee_probation_events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This record was not found.");
  return data;
}

/** Everything a letter needs: the company, the staff name and position, and the dates of the probation. */
async function letterContext(supabase: Supabase, probation: Awaited<ReturnType<typeof getProbation>>): Promise<LetterContext> {
  const [{ data: employee }, { data: company }] = await Promise.all([
    supabase.from("employees").select("full_name, position").eq("id", probation.employee_id).maybeSingle(),
    supabase.from("companies").select("legal_name").eq("id", probation.company_id).maybeSingle(),
  ]);
  const tidy = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Bin|Binti|Bt|Bte)\b/g, (w) => w.toLowerCase());
  return {
    companyName: company?.legal_name ?? "The Company",
    employeeName: tidy(employee?.full_name ?? ""),
    position: probation.position_in_letter ?? (employee?.position ? tidy(employee.position) : null),
    startDate: probation.start_date,
    months: probation.probation_months,
    offerLetterDate: probation.letter_date,
    today: todayInMalaysia(),
  };
}

function revalidate(employeeId?: string) {
  revalidatePath("/hr/probation");
  revalidatePath("/hr");
  if (employeeId) revalidatePath(`/hr/${employeeId}`);
}

// ---------- reading and saving the probation details ----------

export type OfferLetterReading = { data: OfferLetterData; nameMatches: boolean; note: string | null };

/** Reads an uploaded offer letter (Word or PDF) and returns what it says; nothing is saved until HR confirms it. */
export async function readOfferLetter(documentId: string, employeeId: string): Promise<ActionResult<{ reading: OfferLetterReading }>> {
  return runAction(async () => {
    const { supabase } = await requireAdmin();
    const { data: employee } = await supabase.from("employees").select("full_name").eq("id", employeeId).maybeSingle();
    if (!employee) throw new Error("This staff record was not found.");
    const outcome = await ensureDocumentMarkdown(supabase, documentId);
    if (outcome.status !== "done" || !outcome.markdown?.trim()) {
      throw new Error(`The letter was saved, but its text could not be read${outcome.note ? ` (${outcome.note})` : ""}. Please type the details below.`);
    }
    const data = parseOfferLetter(outcome.markdown);
    const nameMatches = sameNameWords(data.name, employee.full_name);
    if (data.name && !nameMatches) data.issues.push(`The name in the letter ("${data.name}") is not the same as this staff member. Check that it is the right letter.`);
    return { reading: { data, nameMatches, note: outcome.note } };
  });
}

export type ProbationDetailsInput = {
  employeeId: string;
  startDate: string;
  months: number;
  /** the position written in the offer letter */
  position?: string;
  letterDate?: string;
  /** the offer letter file, already uploaded */
  documentId?: string;
  source?: "offer_letter" | "hr_record" | "manual";
};

/**
 * Saves the probation of a staff member (a new record, or HR correcting the extracted details). The original end date is worked out
 * here from the start date and the months, and cannot be changed once an extension exists. A correction is written in the history.
 */
export async function saveProbationDetails(input: ProbationDetailsInput): Promise<ActionResult<{ probationId: string }>> {
  return runAction(async () => {
    const { supabase, userId, userName } = await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !parseLetterDate(input.startDate.split("-").reverse().join("/"))) throw new Error("Enter a valid start date.");
    if (!Number.isInteger(input.months) || input.months < 1 || input.months > 12) throw new Error("The probation period must be between 1 and 12 months.");
    if (input.letterDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.letterDate)) throw new Error("Enter a valid date for the offer letter.");

    const { data: employee } = await supabase.from("employees").select("id, company_id, full_name").eq("id", input.employeeId).maybeSingle();
    if (!employee) throw new Error("This staff record was not found.");
    const end = probationEndDate(input.startDate, input.months);

    const { data: existing } = await supabase.from("employee_probation").select("*").eq("employee_id", input.employeeId).maybeSingle();
    const fields = {
      start_date: input.startDate,
      probation_months: input.months,
      position_in_letter: input.position?.trim() || null,
      letter_date: input.letterDate || null,
      needs_verification: false,
      verification_note: null,
      ...(input.documentId ? { offer_letter_document_id: input.documentId } : {}),
    };

    if (!existing) {
      const { data, error } = await supabase
        .from("employee_probation")
        .insert({ employee_id: employee.id, company_id: employee.company_id, ...fields, original_end_date: end, current_end_date: end, source: input.source ?? "manual", created_by: userId })
        .select("id")
        .single();
      if (error) throw error;
      revalidate(employee.id);
      return { probationId: data.id };
    }

    const { count: extensions } = await supabase
      .from("employee_probation_events")
      .select("id", { count: "exact", head: true })
      .eq("probation_id", existing.id)
      .eq("kind", "extension")
      .neq("status", "rejected");
    const datesChanged = existing.start_date !== input.startDate || existing.probation_months !== input.months;
    if ((extensions ?? 0) > 0 && datesChanged) {
      throw new Error("The start date and probation period cannot be changed after an extension has been recorded. The original dates are kept.");
    }

    const { error } = await supabase
      .from("employee_probation")
      .update({
        ...fields,
        ...(datesChanged ? { original_end_date: end, current_end_date: end } : {}),
        ...(input.source ? { source: input.source } : {}),
      })
      .eq("id", existing.id);
    if (error) throw error;

    const changes: string[] = [];
    if (existing.start_date !== input.startDate) changes.push(`start date ${formatShortDate(existing.start_date)} -> ${formatShortDate(input.startDate)}`);
    if (existing.probation_months !== input.months) changes.push(`probation period ${existing.probation_months ?? "not set"} -> ${input.months} month(s)`);
    if (existing.needs_verification) changes.push("details verified by HR");
    if (input.documentId && existing.offer_letter_document_id !== input.documentId) changes.push("offer letter attached");
    if (changes.length > 0) {
      await supabase.from("employee_probation_events").insert({
        probation_id: existing.id,
        employee_id: employee.id,
        company_id: employee.company_id,
        kind: "correction",
        notes: `Corrected by ${userName}: ${changes.join("; ")}`,
        previous_end_date: existing.current_end_date,
        new_end_date: datesChanged ? end : existing.current_end_date,
        status: "issued",
        requested_by: userId,
        requested_by_name: userName,
      });
    }

    if (input.documentId) await fileOfferLetter(supabase, employee.id, employee.company_id, input.documentId, input.letterDate);
    revalidate(employee.id);
    return { probationId: existing.id };
  });
}

/** Files the offer letter among the staff documents (once). */
async function fileOfferLetter(supabase: Supabase, employeeId: string, companyId: string, documentId: string, letterDate?: string) {
  const { data: already } = await supabase.from("employee_certificates").select("id").eq("employee_id", employeeId).eq("document_id", documentId).maybeSingle();
  if (already) return;
  await supabase.from("employee_certificates").insert({
    employee_id: employeeId,
    company_id: companyId,
    cert_type: "offer_letter",
    cert_name: "Offer Letter",
    issued_date: letterDate || null,
    document_id: documentId,
  });
}

/** Saves a probation made from an uploaded offer letter: the probation record and the letter filed in the profile, in one step. */
export async function saveFromOfferLetter(input: ProbationDetailsInput & { documentId: string }): Promise<ActionResult<{ probationId: string }>> {
  const result = await saveProbationDetails({ ...input, source: "offer_letter" });
  if (!result.ok) return result;
  const { supabase } = await requireAdmin();
  const { data: employee } = await supabase.from("employees").select("company_id").eq("id", input.employeeId).maybeSingle();
  if (employee) await fileOfferLetter(supabase, input.employeeId, employee.company_id, input.documentId, input.letterDate);
  return result;
}

// ---------- extension ----------

export type ExtensionInput = {
  probationId: string;
  reason: string;
  notes: string;
  evidenceDocumentId?: string;
  /** the new end date (YYYY-MM-DD) */
  newEndDate: string;
};

/** HR asks for a probation to be extended: the reason, notes and evidence are kept, and the letter draft is written. Nothing changes until management approves. */
export async function requestExtension(input: ExtensionInput): Promise<ActionResult<{ eventId: string }>> {
  return runAction(async () => {
    const { supabase, userId, userName } = await requireAdmin();
    const probation = await getProbation(supabase, input.probationId);
    if (probation.is_confirmed) throw new Error("This staff member is already confirmed.");
    if (!probation.current_end_date) throw new Error("Verify the start date and probation period first.");
    if (!input.reason) throw new Error("Choose the reason for the extension.");
    if (!input.notes.trim()) throw new Error("Add notes for the extension (what happened and what was discussed).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newEndDate)) throw new Error("Enter the new probation end date.");
    if (input.newEndDate <= probation.current_end_date) throw new Error("The new end date must be after the current end date.");

    const { data: open } = await supabase
      .from("employee_probation_events")
      .select("id")
      .eq("probation_id", probation.id)
      .in("kind", ["extension", "confirmation"])
      .in("status", ["draft", "pending_approval", "approved"])
      .maybeSingle();
    if (open) throw new Error("There is already a letter in progress for this staff member. Finish or cancel it first.");

    const ctx = await letterContext(supabase, probation);
    const letter = extensionLetterText(ctx, { previousEnd: probation.current_end_date, newEnd: input.newEndDate, reason: input.reason });
    // whole months between the two end dates, when it is an exact number
    let months: number | null = null;
    for (let m = 1; m <= 12; m++) if (probationEndDate(addDays(probation.current_end_date, 1), m) === input.newEndDate) months = m;

    const { data, error } = await supabase
      .from("employee_probation_events")
      .insert({
        probation_id: probation.id,
        employee_id: probation.employee_id,
        company_id: probation.company_id,
        kind: "extension",
        reason: input.reason,
        notes: input.notes.trim(),
        evidence_document_id: input.evidenceDocumentId || null,
        previous_end_date: probation.current_end_date,
        new_end_date: input.newEndDate,
        extension_months: months,
        letter_text: letter,
        status: "draft",
        requested_by: userId,
        requested_by_name: userName,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidate(probation.employee_id);
    return { eventId: data.id };
  });
}

/** HR prepares the confirmation letter of a staff member who passed probation. */
export async function startConfirmation(probationId: string, effectiveDate: string): Promise<ActionResult<{ eventId: string }>> {
  return runAction(async () => {
    const { supabase, userId, userName } = await requireAdmin();
    const probation = await getProbation(supabase, probationId);
    if (probation.is_confirmed) throw new Error("This staff member is already confirmed.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Enter the date the confirmation takes effect.");
    const { data: open } = await supabase
      .from("employee_probation_events")
      .select("id")
      .eq("probation_id", probation.id)
      .in("kind", ["extension", "confirmation"])
      .in("status", ["draft", "pending_approval", "approved"])
      .maybeSingle();
    if (open) throw new Error("There is already a letter in progress for this staff member. Finish or cancel it first.");

    const ctx = await letterContext(supabase, probation);
    const { data, error } = await supabase
      .from("employee_probation_events")
      .insert({
        probation_id: probation.id,
        employee_id: probation.employee_id,
        company_id: probation.company_id,
        kind: "confirmation",
        effective_date: effectiveDate,
        previous_end_date: probation.current_end_date,
        letter_text: confirmationLetterText(ctx, { effectiveDate }),
        status: "draft",
        requested_by: userId,
        requested_by_name: userName,
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.from("employee_probation").update({ confirmation_letter_status: "draft" }).eq("id", probation.id);
    revalidate(probation.employee_id);
    return { eventId: data.id };
  });
}

/** HR edits the wording of a letter that has not gone for approval yet. */
export async function saveLetterDraft(eventId: string, letterText: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireAdmin();
    const event = await getEvent(supabase, eventId);
    if (event.status !== "draft") throw new Error("Only a draft letter can be edited.");
    if (!letterText.trim()) throw new Error("The letter cannot be empty.");
    const { error } = await supabase.from("employee_probation_events").update({ letter_text: letterText }).eq("id", eventId);
    if (error) throw error;
    revalidate(event.employee_id);
    return {};
  });
}

/** The letter goes to management for approval. */
export async function submitForApproval(eventId: string, letterText?: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireAdmin();
    const event = await getEvent(supabase, eventId);
    if (event.status !== "draft") throw new Error("This letter has already been sent for approval.");
    const { error } = await supabase
      .from("employee_probation_events")
      .update({ status: "pending_approval", ...(letterText?.trim() ? { letter_text: letterText } : {}) })
      .eq("id", eventId);
    if (error) throw error;
    if (event.kind === "confirmation") await supabase.from("employee_probation").update({ confirmation_letter_status: "pending_approval" }).eq("id", event.probation_id);
    revalidate(event.employee_id);
    return {};
  });
}

/**
 * Management decides. Approving an extension moves the current end date (the original date stays on the record); approving a
 * confirmation makes the letter ready to issue. The person who asked for it cannot approve their own request.
 */
export async function decideApproval(eventId: string, approve: boolean, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId, userName } = await requireAdmin("Only management (a Super Admin) can approve or reject this letter.");
    const event = await getEvent(supabase, eventId);
    if (event.status !== "pending_approval") throw new Error("This letter is not waiting for approval.");
    if (event.requested_by === userId) throw new Error("The person who prepared the letter cannot approve it. Management must approve it.");
    if (!approve && !note.trim()) throw new Error("Write why it is not approved.");

    const { error } = await supabase
      .from("employee_probation_events")
      .update({ status: approve ? "approved" : "rejected", decided_by: userId, decided_by_name: userName, decided_at: new Date().toISOString(), decision_note: note.trim() || null })
      .eq("id", eventId);
    if (error) throw error;

    if (event.kind === "extension" && approve && event.new_end_date) {
      const { error: moveError } = await supabase.from("employee_probation").update({ current_end_date: event.new_end_date }).eq("id", event.probation_id);
      if (moveError) throw moveError;
    }
    if (event.kind === "confirmation") {
      await supabase.from("employee_probation").update({ confirmation_letter_status: approve ? "approved" : "none" }).eq("id", event.probation_id);
    }
    revalidate(event.employee_id);
    return {};
  });
}

/** HR withdraws a letter that is still a draft or waiting for approval. It stays in the history as not approved. */
export async function cancelLetter(eventId: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId, userName } = await requireAdmin();
    const event = await getEvent(supabase, eventId);
    if (event.status !== "draft" && event.status !== "pending_approval") throw new Error("Only a draft letter, or one waiting for approval, can be cancelled.");
    const { error } = await supabase
      .from("employee_probation_events")
      .update({ status: "rejected", decided_by: userId, decided_by_name: userName, decided_at: new Date().toISOString(), decision_note: note.trim() || "Cancelled by HR" })
      .eq("id", eventId);
    if (error) throw error;
    if (event.kind === "confirmation") await supabase.from("employee_probation").update({ confirmation_letter_status: "none" }).eq("id", event.probation_id);
    revalidate(event.employee_id);
    return {};
  });
}

/** The approved letter is issued: its PDF (already uploaded as a private staff file) is linked to the record, and a confirmation makes the staff member Confirmed. */
export async function issueLetter(eventId: string, fileId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireAdmin();
    const event = await getEvent(supabase, eventId);
    if (event.status !== "approved") throw new Error("The letter must be approved by management before it is issued.");
    const { data: file } = await supabase.from("employee_files").select("id, employee_id").eq("id", fileId).maybeSingle();
    if (!file || file.employee_id !== event.employee_id) throw new Error("The letter file was not found for this staff member.");
    const probation = await getProbation(supabase, event.probation_id);
    const { error } = await supabase.from("employee_probation_events").update({ status: "issued", issued_at: new Date().toISOString(), issued_file_id: fileId }).eq("id", eventId);
    if (error) throw error;
    if (event.kind === "confirmation") {
      await supabase
        .from("employee_probation")
        .update({ is_confirmed: true, confirmed_date: event.effective_date ?? todayInMalaysia(), confirmation_letter_status: "issued" })
        .eq("id", probation.id);
    }
    revalidate(event.employee_id);
    return {};
  });
}

/** For staff who were confirmed before this tracker existed (the letter was given earlier): records the date, with no new letter. */
export async function recordConfirmed(probationId: string, confirmedDate: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId, userName } = await requireAdmin();
    const probation = await getProbation(supabase, probationId);
    if (probation.is_confirmed) throw new Error("This staff member is already confirmed.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedDate)) throw new Error("Enter the date of confirmation.");
    const { data: open } = await supabase
      .from("employee_probation_events")
      .select("id")
      .eq("probation_id", probation.id)
      .in("kind", ["extension", "confirmation"])
      .in("status", ["draft", "pending_approval", "approved"])
      .maybeSingle();
    if (open) throw new Error("There is a letter in progress for this staff member. Finish or cancel it first.");
    const { error } = await supabase.from("employee_probation").update({ is_confirmed: true, confirmed_date: confirmedDate, confirmation_letter_status: "issued" }).eq("id", probation.id);
    if (error) throw error;
    await supabase.from("employee_probation_events").insert({
      probation_id: probation.id,
      employee_id: probation.employee_id,
      company_id: probation.company_id,
      kind: "recorded",
      effective_date: confirmedDate,
      notes: `Confirmation recorded by ${userName} (given before this tracker was used)${note.trim() ? `: ${note.trim()}` : ""}`,
      status: "issued",
      requested_by: userId,
      requested_by_name: userName,
    });
    revalidate(probation.employee_id);
    return {};
  });
}
