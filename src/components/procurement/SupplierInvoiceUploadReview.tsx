"use client";

import { DOCUMENT_FILE_ACCEPT } from "@/lib/documents/upload";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentUpload } from "@/lib/importFlow/useDocumentUpload";
import { ImportTabs, FileDropZone, ExtractionNotice, FormError, ConfirmActions, DuplicateCheckPanel } from "@/components/shared/import/ImportFlowAtoms";
import { createSupplierInvoice } from "@/lib/procurement/actions";
import { checkDuplicateInvoiceAction } from "@/lib/procurement/checkDuplicate";
import type { DuplicateMatch } from "@/lib/importFlow/types";

type Company = { id: string; name: string };
type Supplier = { id: string; name: string; company_id: string };
type PurchaseOrder = { id: string; po_number: string; company_id: string; supplier_id: string };
type Item = { itemName: string; quantity: string; unitPrice: string };

type ExtractedInvoice = {
  supplier_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount?: number;
  items?: { item_name?: string; quantity?: number; unit_price?: number }[];
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function emptyItem(): Item {
  return { itemName: "", quantity: "1", unitPrice: "" };
}

export function SupplierInvoiceUploadReview({
  companies,
  defaultCompanyId,
  suppliers,
  purchaseOrders,
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  redirectTo: string;
}) {
  const router = useRouter();
  const flow = useDocumentUpload();

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [department, setDepartment] = useState("");
  const [form, setForm] = useState({ invoiceNumber: "", invoiceDate: "", dueDate: "", amount: "" });
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const suppliersForCompany = suppliers.filter((s) => s.company_id === companyId);
  const posForSupplier = purchaseOrders.filter((po) => po.company_id === companyId && po.supplier_id === supplierId);

  function selectTab(next: Parameters<typeof flow.selectTab>[0]) {
    flow.selectTab(next);
    setItems([emptyItem()]);
  }

  async function handleUploadAndExtract() {
    const extracted = (await flow.uploadAndExtract({ companyId, module: "supplier-procurement", extractionKind: "supplier_invoice" })) as ExtractedInvoice | null;
    if (extracted) {
      const matchedSupplier = suppliersForCompany.find((s) => s.name.toLowerCase() === (extracted.supplier_name ?? "").toLowerCase());
      if (matchedSupplier) setSupplierId(matchedSupplier.id);
      setForm({
        invoiceNumber: extracted.invoice_number ?? "",
        invoiceDate: extracted.invoice_date ?? "",
        dueDate: extracted.due_date ?? "",
        amount: extracted.amount?.toString() ?? "",
      });
      if (extracted.items && extracted.items.length > 0) {
        setItems(extracted.items.map((it) => ({ itemName: it.item_name ?? "", quantity: it.quantity?.toString() ?? "1", unitPrice: it.unit_price?.toString() ?? "" })));
      }
    }
  }

  async function handleCheckDuplicates() {
    if (!supplierId || !form.invoiceDate || !form.amount) {
      flow.setError("Select a supplier and fill in the invoice date and amount before checking for duplicates.");
      return;
    }
    await flow.runDuplicateCheck(async (): Promise<DuplicateMatch[]> => {
      const matches = await checkDuplicateInvoiceAction({
        companyId,
        supplierId,
        invoiceNumber: form.invoiceNumber,
        amount: Number(form.amount),
        invoiceDate: form.invoiceDate,
      });
      return matches.map((m) => ({ id: m.id, label: m.invoice_number, meta: `RM ${m.amount} · ${m.invoice_date} · status: ${m.status}` }));
    });
  }

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleConfirm() {
    if (!supplierId || !form.invoiceNumber || !form.invoiceDate || !form.dueDate || !form.amount) {
      flow.setError("Supplier, invoice number, dates and amount are all required.");
      return;
    }
    try {
      await flow.confirm(async () => {
        await createSupplierInvoice({
          companyId,
          supplierId,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          amount: Number(form.amount),
          department: department || undefined,
          purchaseOrderId: purchaseOrderId || undefined,
          documentId: flow.documentId || undefined,
          items: items
            .filter((i) => i.itemName.trim())
            .map((i) => ({ itemName: i.itemName.trim(), quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0 })),
        });
      });
      router.push(redirectTo);
      router.refresh();
    } catch {
      // error already surfaced by the hook
    }
  }

  return (
    <div>
      <ImportTabs tab={flow.tab} onSelect={selectTab} pdfLabel="Upload File (PDF / Excel / CSV)" photoLabel="Photo / Screenshot" />

      <div className="p-6">
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Company *</label>
            <select
              required
              disabled={flow.documentId !== null}
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setSupplierId(""); setPurchaseOrderId(""); }}
              className={`${inputClass} disabled:bg-surface-alt disabled:text-text-muted`}
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} />
          </div>
        </div>

        {flow.step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FileDropZone
              file={flow.file}
              accept={flow.tab === "pdf" ? DOCUMENT_FILE_ACCEPT : "image/*"}
              prompt={`Click to choose a ${flow.tab === "pdf" ? "PDF invoice" : "photo of the invoice"}`}
              onChange={flow.setFile}
            />
            <FormError error={flow.error} />
            <button onClick={handleUploadAndExtract} disabled={!flow.file || flow.uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {flow.uploading ? "Uploading & reading document..." : "Upload & Extract"}
            </button>
          </div>
        )}

        {flow.step === "review" && (
          <div className="flex flex-col gap-4">
            <ExtractionNotice notice={flow.notice} />
            <FormError error={flow.error} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Supplier *</label>
                <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPurchaseOrderId(""); flow.resetDuplicateState(); }} className={inputClass}>
                  <option value="">Select supplier</option>
                  {suppliersForCompany.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Related Purchase Order</label>
                <select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)} className={inputClass}>
                  <option value="">Not linked to a PO</option>
                  {posForSupplier.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Invoice Number *</label>
                <input value={form.invoiceNumber} onChange={(e) => { setForm((f) => ({ ...f, invoiceNumber: e.target.value })); flow.resetDuplicateState(); }} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Amount (RM) *</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); flow.resetDuplicateState(); }} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Invoice Date *</label>
                <input type="date" value={form.invoiceDate} onChange={(e) => { setForm((f) => ({ ...f, invoiceDate: e.target.value })); flow.resetDuplicateState(); }} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Due Date *</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className={labelClass}>Items</label>
                <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])} className="text-[12.5px] font-semibold text-primary">
                  + Add Item
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-[2fr_0.8fr_1fr_auto] items-center gap-2">
                    <input value={item.itemName} onChange={(e) => updateItem(i, "itemName", e.target.value)} placeholder="Item name" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
                    <input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} placeholder="Qty" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
                    <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} placeholder="Unit Price" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={items.length === 1}
                      className="text-xs font-semibold text-danger disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <DuplicateCheckPanel
              checked={flow.duplicatesChecked}
              checking={flow.checkingDuplicates}
              matches={flow.duplicates}
              onCheck={handleCheckDuplicates}
              hint="Run this before saving — it looks for an existing invoice from this supplier with the same number or a matching amount and date."
            />

            <ConfirmActions
              onCancel={() => router.push(redirectTo)}
              onConfirm={handleConfirm}
              saving={flow.saving}
              danger={flow.hasDuplicates}
              disabled={!flow.duplicatesChecked}
            />
          </div>
        )}
      </div>
    </div>
  );
}
