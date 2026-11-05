"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { recordAudit } from "@/lib/audit";

export type NoteInput = {
  companyId: string;
  supplierId: string;
  noteType: "credit" | "debit";
  noteNumber: string;
  noteDate: string;
  supplierInvoiceId?: string;
  reason?: string;
  items: { itemCode?: string; itemName: string; quantity: number; uom?: string; unitPrice: number }[];
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

const cents = (n: number) => Math.round(n * 100) / 100;

function prepare(input: NoteInput) {
  if (!input.supplierId) throw new Error("Select a supplier.");
  if (!input.noteNumber.trim()) throw new Error("Enter the note number.");
  const items = input.items.filter((i) => i.itemName.trim() && i.quantity > 0);
  if (items.length === 0) throw new Error("Add at least one item.");
  return { items, amount: cents(items.reduce((t, i) => t + i.quantity * i.unitPrice, 0)) };
}

const itemRows = (noteId: string, items: NoteInput["items"]) =>
  items.map((i) => ({
    supplier_note_id: noteId,
    item_code: i.itemCode?.trim() || null,
    item_name: i.itemName.trim(),
    quantity: i.quantity,
    uom: i.uom?.trim() || null,
    unit_price: i.unitPrice,
    line_total: cents(i.quantity * i.unitPrice),
  }));

const label = (t: string) => (t === "credit" ? "Credit note" : "Debit note");

export async function createSupplierNote(input: NoteInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, userId } = await requireUser();
    const { items, amount } = prepare(input);
    const { data: note, error } = await supabase
      .from("supplier_notes")
      .insert({
        company_id: input.companyId,
        supplier_id: input.supplierId,
        note_type: input.noteType,
        note_number: input.noteNumber.trim(),
        note_date: input.noteDate,
        supplier_invoice_id: input.supplierInvoiceId || null,
        reason: input.reason?.trim() || null,
        amount,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error(`${label(input.noteType)} number ${input.noteNumber.trim()} already exists. Use another number.`);
      throw error;
    }
    const { error: itemsError } = await supabase.from("supplier_note_items").insert(itemRows(note.id, items));
    if (itemsError) {
      await supabase.from("supplier_notes").delete().eq("id", note.id);
      throw itemsError;
    }
    await recordAudit({ companyId: input.companyId, relatedTable: "supplier_notes", relatedId: note.id, action: "created", newValue: `${label(input.noteType)} ${input.noteNumber.trim()} · RM ${amount.toFixed(2)}` });
    revalidatePath("/supplier-procurement/notes");
    return { id: note.id };
  }, "Could not save the note. Please try again.");
}

export async function updateSupplierNote(id: string, input: NoteInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { items, amount } = prepare(input);
    const { data: before } = await supabase.from("supplier_notes").select("*, supplier_note_items(*)").eq("id", id).maybeSingle();
    if (!before) throw new Error("This note was not found (it may have been deleted).");
    const { error } = await supabase
      .from("supplier_notes")
      .update({ supplier_id: input.supplierId, note_number: input.noteNumber.trim(), note_date: input.noteDate, supplier_invoice_id: input.supplierInvoiceId || null, reason: input.reason?.trim() || null, amount, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error(`${label(before.note_type)} number ${input.noteNumber.trim()} already exists. Use another number.`);
      throw error;
    }
    const { error: deleteError } = await supabase.from("supplier_note_items").delete().eq("supplier_note_id", id);
    if (deleteError) throw deleteError;
    const { error: itemsError } = await supabase.from("supplier_note_items").insert(itemRows(id, items));
    if (itemsError) {
      // put the old lines back so the note is never left empty
      await supabase.from("supplier_note_items").insert(before.supplier_note_items);
      throw itemsError;
    }
    await recordAudit({ companyId: before.company_id, relatedTable: "supplier_notes", relatedId: id, action: "edited", previousValue: `${before.note_number} · RM ${Number(before.amount).toFixed(2)}`, newValue: `${input.noteNumber.trim()} · RM ${amount.toFixed(2)}` });
    revalidatePath("/supplier-procurement/notes");
    revalidatePath(`/supplier-procurement/notes/${id}`);
    return { id };
  }, "Could not save the note. Please try again.");
}

export async function deleteSupplierNote(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: note } = await supabase.from("supplier_notes").select("*").eq("id", id).maybeSingle();
    if (!note) throw new Error("This note was not found (it may already be deleted).");
    const { data: removed, error } = await supabase.from("supplier_notes").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the note.");
    await recordAudit({ companyId: note.company_id, relatedTable: "supplier_notes", relatedId: id, action: "deleted", previousValue: `${label(note.note_type)} ${note.note_number} · RM ${Number(note.amount).toFixed(2)}`, newValue: "Deleted" });
    revalidatePath("/supplier-procurement/notes");
    return {};
  }, "Could not delete the note. Please try again.");
}
