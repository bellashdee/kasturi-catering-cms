import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplierNote } from "@/lib/procurement/queries";
import { SupplierNoteForm } from "@/components/procurement/SupplierNoteForm";
import { getItemSuggestions } from "@/lib/procurement/itemSuggestions";

export default async function EditSupplierNotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  let note;
  try {
    note = await getSupplierNote(supabase, id);
  } catch {
    notFound();
  }

  const [{ data: companies }, { data: suppliers }, { data: invoices }, suggestions] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", note.company_id),
    supabase.from("suppliers").select("id, name, company_id").eq("company_id", note.company_id).order("name"),
    supabase.from("supplier_invoices").select("id, invoice_number, supplier_id, company_id").eq("company_id", note.company_id).order("invoice_date", { ascending: false }).limit(1000),
    getItemSuggestions(supabase, [note.company_id]),
  ]);
  const noteType = note.note_type === "debit" ? "debit" : "credit";

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {noteType === "credit" ? "Credit" : "Debit"} Note {note.note_number}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SupplierNoteForm
          noteType={noteType}
          companies={companies ?? []}
          defaultCompanyId={note.company_id}
          suppliers={suppliers ?? []}
          invoices={(invoices ?? []).map((i) => ({ id: i.id, invoiceNumber: i.invoice_number, supplierId: i.supplier_id, companyId: i.company_id }))}
          suggestions={suggestions}
          noteId={id}
          initial={{
            supplierId: note.supplier_id,
            noteNumber: note.note_number,
            noteDate: note.note_date,
            supplierInvoiceId: note.supplier_invoice_id ?? "",
            reason: note.reason ?? "",
            items: note.supplier_note_items.map((i) => ({ itemCode: i.item_code ?? "", itemName: i.item_name, quantity: String(i.quantity), uom: i.uom ?? "", unitPrice: String(i.unit_price) })),
          }}
        />
      </div>
    </div>
  );
}
