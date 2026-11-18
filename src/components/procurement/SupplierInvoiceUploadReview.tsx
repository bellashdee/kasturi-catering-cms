"use client";

import { DOCUMENT_FILE_ACCEPT } from "@/lib/documents/upload";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useDocumentUpload } from "@/lib/importFlow/useDocumentUpload";
import { ImportTabs, FileDropZone, ExtractionNotice, FormError, ConfirmActions, DuplicateCheckPanel } from "@/components/shared/import/ImportFlowAtoms";
import { createSupplierInvoice } from "@/lib/procurement/actions";
import { checkDuplicateInvoiceAction } from "@/lib/procurement/checkDuplicate";
import type { DuplicateMatch } from "@/lib/importFlow/types";
import { Select } from "@/components/ui/Select";
import { AutoCountInvoiceField } from "@/components/procurement/AutoCountInvoiceField";

type Company = { id: string; name: string };
type Supplier = { id: string; name: string; company_id: string };
/** One invoice line, every value as text exactly as printed / typed. `auto` = the amount of a hand-typed line follows quantity × price. */
type Item = { itemCode: string; itemName: string; uom: string; quantity: string; unitPrice: string; discount: string; lineTotal: string; auto: boolean };

type ExtractedInvoice = {
  supplier_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  amount?: number;
  items?: { item_code?: string | null; item_name?: string | null; uom?: string | null; quantity?: number | string | null; unit_price?: number | string | null; discount?: number | string | null; line_total?: number | string | null }[];
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "block text-[12.5px] font-semibold text-text-secondary";
/** a box of one invoice line: fills its column exactly, so it lines up with the header above it */
const cellClass = "h-9 w-full min-w-0 rounded-lg border border-border-strong px-2 text-[13px]";

function emptyItem(): Item {
  return { itemCode: "", itemName: "", uom: "", quantity: "", unitPrice: "", discount: "", lineTotal: "", auto: true };
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const isBlank = (i: Item) => !i.itemCode.trim() && !i.itemName.trim() && !i.uom.trim() && !i.quantity.trim() && !i.unitPrice.trim() && !i.discount.trim() && !i.lineTotal.trim();
const money = (n: number) => n.toFixed(2);

/** quantity × unit price − discount, for a line the user types by hand (extracted lines keep the amount printed on the invoice). */
function typedLineTotal(i: Item): string {
  const q = Number(i.quantity);
  const p = Number(i.unitPrice);
  if (!i.quantity.trim() || !i.unitPrice.trim() || !Number.isFinite(q) || !Number.isFinite(p)) return "";
  return money(q * p - (Number(i.discount) || 0));
}

export function SupplierInvoiceUploadReview({
  companies,
  defaultCompanyId,
  suppliers,
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  suppliers: Supplier[];
  redirectTo: string;
}) {
  const router = useRouter();
  const flow = useDocumentUpload();

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [autoCountNo, setAutoCountNo] = useState("");
  const [department, setDepartment] = useState("");
  const [form, setForm] = useState({ invoiceNumber: "", invoiceDate: "", dueDate: "", amount: "" });
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const suppliersForCompany = suppliers.filter((s) => s.company_id === companyId);

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
        // exactly what the reader found on each line: a value that is not printed stays blank (no default quantity or price)
        setItems(
          extracted.items.map((it) => ({
            itemCode: text(it.item_code),
            itemName: text(it.item_name),
            uom: text(it.uom),
            quantity: text(it.quantity),
            unitPrice: text(it.unit_price),
            discount: text(it.discount),
            lineTotal: text(it.line_total),
            auto: false,
          })),
        );
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
      return matches.map((m) => ({ id: m.id, label: m.invoice_number, meta: `RM ${m.amount} · ${m.invoice_date}` }));
    });
  }

  function updateItem(index: number, field: Exclude<keyof Item, "auto">, value: string) {
    setItems((prev) => {
      const next = [...prev];
      const line = { ...next[index], [field]: value };
      if (field === "lineTotal") line.auto = false;
      else if (line.auto) line.lineTotal = typedLineTotal(line);
      next[index] = line;
      return next;
    });
  }

  const filledItems = items.filter((i) => !isBlank(i));
  const linesSum = filledItems.every((i) => i.lineTotal.trim() && Number.isFinite(Number(i.lineTotal))) ? filledItems.reduce((t, i) => t + Number(i.lineTotal), 0) : null;
  const invoiceAmount = form.amount.trim() && Number.isFinite(Number(form.amount)) ? Number(form.amount) : null;

  async function handleConfirm() {
    if (!supplierId || !form.invoiceNumber || !form.invoiceDate || !form.dueDate || !form.amount) {
      flow.setError("Supplier, invoice number, dates and amount are all required.");
      return;
    }
    // every line is saved exactly as shown: a line that is missing a figure is reported, never completed or dropped
    const lines = items.filter((i) => !isBlank(i));
    for (const [n, i] of lines.entries()) {
      const bad = (value: string, required: boolean) => (value.trim() === "" ? required : !Number.isFinite(Number(value)));
      if (!i.itemName.trim() || bad(i.quantity, true) || bad(i.unitPrice, true) || bad(i.lineTotal, true) || bad(i.discount, false)) {
        flow.setError(`Line ${n + 1}: fill in the item, quantity, unit price and amount exactly as on the invoice (or remove the line).`);
        return;
      }
    }
    try {
      await flow.confirm(async () => {
        const result = await createSupplierInvoice({
          companyId,
          supplierId,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          amount: Number(form.amount),
          department: department || undefined,
          autoCountInvoiceNo: autoCountNo.trim() || undefined,
          documentId: flow.documentId || undefined,
          items: lines.map((i) => ({
            itemCode: i.itemCode.trim() || undefined,
            itemName: i.itemName.trim(),
            uom: i.uom.trim() || undefined,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discount: i.discount.trim() ? Number(i.discount) : undefined,
            lineTotal: Number(i.lineTotal),
          })),
        });
        if (!result.ok) throw new Error(result.error);
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
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Company *</label>
            <Select
              required
              disabled={flow.documentId !== null}
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setSupplierId(""); }}
              className={`${inputClass} disabled:bg-surface-alt disabled:text-text-muted`}
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
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
            <ExtractionNotice notice={flow.notice} report={flow.report} />
            <FormError error={flow.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Supplier *</label>
                <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); flow.resetDuplicateState(); }} className={inputClass}>
                  <option value="">Select supplier</option>
                  {suppliersForCompany.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <AutoCountInvoiceField value={autoCountNo} onChange={setAutoCountNo} inputClassName={inputClass} labelClassName={labelClass} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Invoice Number *</label>
                <input value={form.invoiceNumber} onChange={(e) => { setForm((f) => ({ ...f, invoiceNumber: e.target.value })); flow.resetDuplicateState(); }} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Amount (RM) *</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); flow.resetDuplicateState(); }} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <p className="mb-2 text-[12px] text-text-muted">Saved exactly as printed on the invoice: nothing is rounded, renamed or completed.</p>
              <div className="overflow-x-auto">
                {/* one grid for the headers and every line, so each header sits exactly above its box */}
                <div className="grid min-w-[600px] grid-cols-[minmax(0,0.9fr)_minmax(0,2.2fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)_3.5rem] items-center gap-x-2 gap-y-2">
                  {["Code", "Item (as printed)", "UOM", "Qty", "Unit price", "Discount", "Amount"].map((h) => (
                    <div key={h} className="truncate px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">{h}</div>
                  ))}
                  <div />
                  {items.map((item, i) => (
                    <Fragment key={i}>
                      <input aria-label="Code" value={item.itemCode} onChange={(e) => updateItem(i, "itemCode", e.target.value)} className={cellClass} />
                      <input aria-label="Item (as printed)" value={item.itemName} onChange={(e) => updateItem(i, "itemName", e.target.value)} className={cellClass} />
                      <input aria-label="UOM" value={item.uom} onChange={(e) => updateItem(i, "uom", e.target.value)} className={cellClass} />
                      <input aria-label="Qty" type="number" step="any" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className={cellClass} />
                      <input aria-label="Unit price" type="number" step="any" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} className={cellClass} />
                      <input aria-label="Discount" type="number" step="any" value={item.discount} onChange={(e) => updateItem(i, "discount", e.target.value)} className={cellClass} />
                      <input aria-label="Amount" type="number" step="any" value={item.lineTotal} onChange={(e) => updateItem(i, "lineTotal", e.target.value)} className={cellClass} />
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        disabled={items.length === 1}
                        className="text-xs font-semibold text-danger disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
              {filledItems.length > 0 && linesSum !== null && invoiceAmount !== null && (
                <p className={`mt-2 text-[12.5px] font-semibold ${Math.abs(linesSum - invoiceAmount) <= 0.05 ? "text-success" : "text-warning"}`}>
                  {Math.abs(linesSum - invoiceAmount) <= 0.05
                    ? `The ${filledItems.length} lines add up to RM ${money(linesSum)}, the invoice amount.`
                    : `The ${filledItems.length} lines add up to RM ${money(linesSum)}, but the invoice amount is RM ${money(invoiceAmount)} (difference RM ${money(Math.abs(linesSum - invoiceAmount))}). Check both against the invoice; nothing is changed automatically.`}
                </p>
              )}
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
