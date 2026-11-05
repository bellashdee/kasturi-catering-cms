import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplierNote } from "@/lib/procurement/queries";
import { formatCurrency } from "@/lib/format";
import { PrintDocumentButton } from "@/components/shared/PrintDocumentButton";
import { DeleteSupplierNoteButton } from "@/components/procurement/DeleteSupplierNoteButton";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard } from "@/components/dashboard/SectionCard";

export default async function SupplierNoteDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();
  let note;
  try {
    note = await getSupplierNote(supabase, id);
  } catch {
    notFound();
  }

  const isCredit = note.note_type === "credit";
  const title = isCredit ? "Credit Note" : "Debit Note";
  const listHref = `/supplier-procurement/notes${query}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={listHref} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Credit / Debit Notes
          </Link>
          <div className="mt-2 flex items-center gap-2 text-[20px] font-extrabold text-text">
            {note.note_number}
            <StatusBadge tone={isCredit ? "success" : "warning"}>{title}</StatusBadge>
          </div>
          <div className="text-[13px] text-text-secondary">
            {note.companies?.name} · {note.suppliers?.name} · {note.note_date}
            {note.supplier_invoices && (
              <>
                {" · invoice "}
                <Link href={`/supplier-procurement/invoices/${note.supplier_invoices.id}${query}`} className="underline">
                  {note.supplier_invoices.invoice_number}
                </Link>
              </>
            )}
          </div>
          {note.reason && <div className="mt-1 text-[13px] text-text-secondary">{note.reason}</div>}
        </div>
        <div className="flex items-start gap-2">
          <PrintDocumentButton
            document={{
              type: isCredit ? "CREDIT NOTE" : "DEBIT NOTE",
              number: note.note_number,
              date: note.note_date,
              terms: note.suppliers?.payment_terms,
              company: { name: note.companies?.legal_name || note.companies?.name || "", registrationNo: note.companies?.registration_no },
              party: { label: "SUPPLIER", name: note.suppliers?.name ?? "", address: note.suppliers?.billing_address, phone: note.suppliers?.phone, registrationNo: note.suppliers?.registration_no },
              reference: note.supplier_invoices?.invoice_number,
              remarks: note.reason,
              lines: note.supplier_note_items.map((i) => ({ code: i.item_code, description: i.item_name, quantity: Number(i.quantity), uom: i.uom, unitPrice: Number(i.unit_price), amount: Number(i.line_total) })),
            }}
          />
          <Link href={`/supplier-procurement/notes/${id}/edit${query}`} className="inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt">
            Edit
          </Link>
          <DeleteSupplierNoteButton noteId={id} label={`${title} ${note.note_number}`} listHref={listHref} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{isCredit ? "Lowers what is owed to the supplier by" : "Raises what is owed to the supplier by"}</div>
        <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(Number(note.amount))}</div>
      </div>

      <SectionCard title="Items">
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3">Code</th>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3">UOM</th>
                <th className="px-3 py-3 text-right">Unit price (RM)</th>
                <th className="px-5 py-3 text-right">Amount (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {note.supplier_note_items.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-3 text-text-secondary">{i.item_code ?? "—"}</td>
                  <td className="px-3 py-3 font-semibold text-text">{i.item_name}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text">{Number(i.quantity)}</td>
                  <td className="px-3 py-3 text-text-secondary">{i.uom ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{Number(i.unit_price).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums text-text">{Number(i.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
