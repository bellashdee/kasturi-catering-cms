"use client";

import { todayInMalaysia } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCostEntry,
  addInvoiceAsRevenue,
  addRevenueEntry,
  deleteCostEntry,
  deleteRevenueEntry,
  saveEventBudget,
  updateCostEntry,
  updateRevenueEntry,
} from "@/lib/finance/eventPnlActions";
import { ADDITIONAL_COST_TYPE_LABEL, COST_BASIS_LABEL, DIRECT_COST_TYPE_LABEL, DUPLICATE_ENTRY_MESSAGE, PAYMENT_STATUS_LABEL, REVENUE_TYPE_LABEL } from "@/lib/finance/eventPnl";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { requestExtraction } from "@/lib/importFlow/extractClient";
import type { ExtractionReport } from "@/lib/extraction/types";
import { ExtractionReportPanel } from "@/components/shared/import/ExtractionReportPanel";

const input = "mt-1 h-10 w-full rounded-lg border border-border-strong px-3 text-[13px] outline-none focus:border-primary";
const label = "text-[12px] font-semibold text-text-secondary";
const todayIso = () => todayInMalaysia();
const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">
      Print / Save as PDF
    </button>
  );
}

function Message({ error, ok }: { error: string | null; ok?: string | null }) {
  if (error) return <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</div>;
  if (ok) return <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[12.5px] text-success">{ok}</div>;
  return null;
}

// ------------------------------------------------------------------ revenue

export type RevenueRowData = { id: string; entry_type: string; description: string | null; amount: number | string; entry_date: string; notes: string | null; customer_invoice_id: string | null };

export function RevenueForm({ eventId, entry, onDone }: { eventId: string; entry?: RevenueRowData; onDone?: () => void }) {
  const router = useRouter();
  const [entryType, setEntryType] = useState(entry?.entry_type ?? "sales");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [entryDate, setEntryDate] = useState(entry?.entry_date ?? todayIso());
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  async function submit(confirmDuplicate: boolean) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (entry) {
        await updateRevenueEntry(entry.id, { entryType, description, amount: Number(amount), entryDate, notes });
        setOk("Revenue entry updated.");
        onDone?.();
      } else {
        await addRevenueEntry({ eventId, entryType, description, amount: Number(amount), entryDate, notes, confirmDuplicate });
        setOk("Revenue recorded.");
        setAmount("");
        setDescription("");
        setNotes("");
        setDuplicate(false);
      }
      router.refresh();
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not save.";
      if (m.includes(DUPLICATE_ENTRY_MESSAGE)) {
        setDuplicate(true);
        setError("An entry with the same type, amount and date already exists for this event. Save anyway only if it is a genuinely separate transaction.");
      } else setError(m);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Type *</label>
          <select value={entryType} onChange={(e) => setEntryType(e.target.value)} disabled={!!entry?.customer_invoice_id} className={input}>
            <optgroup label="Revenue">{["sales", "package", "additional_service", "other_revenue"].map((k) => <option key={k} value={k}>{REVENUE_TYPE_LABEL[k]}</option>)}</optgroup>
            <optgroup label="Deducted from revenue">{["discount", "refund", "credit_note"].map((k) => <option key={k} value={k}>{REVENUE_TYPE_LABEL[k]}</option>)}</optgroup>
          </select>
        </div>
        <div>
          <label className={label}>Amount (RM) *</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setDuplicate(false); }} className={input} />
        </div>
        <div>
          <label className={label}>Date *</label>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
        </div>
      </div>
      <div>
        <label className={label}>Remarks</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
      </div>
      <Message error={error} ok={ok} />
      <div className="flex justify-end gap-2">
        {onDone && <button type="button" onClick={onDone} className="rounded-lg border border-border-strong px-4 py-2 text-[13px] font-semibold text-text">Cancel</button>}
        <button type="button" disabled={saving} onClick={() => submit(duplicate)} className={`rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60 ${duplicate ? "bg-danger" : "bg-primary"}`}>
          {saving ? "Saving..." : duplicate ? "Save anyway" : entry ? "Save changes" : "Add revenue"}
        </button>
      </div>
    </div>
  );
}

export function AddInvoiceRevenueButton({ eventId, invoiceId }: { eventId: string; invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await addInvoiceAsRevenue(eventId, invoiceId);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add.");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg border border-border-strong px-2.5 py-1 text-[12px] font-semibold text-primary disabled:opacity-60"
      >
        {busy ? "Adding..." : "Count as revenue"}
      </button>
      {error && <span className="ml-2 text-[12px] text-danger">{error}</span>}
    </span>
  );
}

// -------------------------------------------------------------------- costs

export type CostRowData = {
  id: string;
  cost_class: string;
  cost_type: string;
  cost_basis: string;
  description: string | null;
  supplier_name: string | null;
  reference_no: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_cost: number | string | null;
  amount: number | string;
  cost_date: string;
  payment_status: string;
  notes: string | null;
};

type SupplierInvoiceOption = { id: string; invoice_number: string; amount: number | string; invoice_date: string; supplierName: string };

type SupplierDoc = { supplier_name?: string | null; invoice_number?: string | null; invoice_date?: string | null; amount?: number | null };

export function CostForm({ eventId, companyId, entry, supplierInvoices = [], onDone }: { eventId: string; companyId: string; entry?: CostRowData; supplierInvoices?: SupplierInvoiceOption[]; onDone?: () => void }) {
  const router = useRouter();
  const [costClass, setCostClass] = useState<"direct" | "additional">((entry?.cost_class as "direct" | "additional") ?? "direct");
  const [costType, setCostType] = useState(entry?.cost_type ?? "food_ingredients");
  const [costBasis, setCostBasis] = useState<"actual" | "estimated">((entry?.cost_basis as "actual" | "estimated") ?? "actual");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [supplierName, setSupplierName] = useState(entry?.supplier_name ?? "");
  const [referenceNo, setReferenceNo] = useState(entry?.reference_no ?? "");
  const [quantity, setQuantity] = useState(entry?.quantity != null ? String(entry.quantity) : "");
  const [unit, setUnit] = useState(entry?.unit ?? "");
  const [unitCost, setUnitCost] = useState(entry?.unit_cost != null ? String(entry.unit_cost) : "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [costDate, setCostDate] = useState(entry?.cost_date ?? todayIso());
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "paid">((entry?.payment_status as "unpaid" | "paid") ?? "unpaid");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [supplierInvoiceId, setSupplierInvoiceId] = useState("");
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [report, setReport] = useState<ExtractionReport | null>(null);
  const [readNotice, setReadNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  const types = costClass === "direct" ? DIRECT_COST_TYPE_LABEL : ADDITIONAL_COST_TYPE_LABEL;
  function changeClass(next: "direct" | "additional") {
    setCostClass(next);
    setCostType(next === "direct" ? "food_ingredients" : "permit");
  }
  function recalc(q: string, uc: string) {
    const a = num(q), b = num(uc);
    if (a !== undefined && b !== undefined && a > 0) setAmount((Math.round(a * b * 100) / 100).toString());
  }

  /** Attach a supplier document: the existing reader proposes the fields, the user checks and edits before anything is saved. */
  async function readDocument() {
    if (!file) return;
    setReading(true);
    setError(null);
    setReadNotice(null);
    setReport(null);
    try {
      const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);
      const { res, result } = await requestExtraction(doc.id, "supplier_invoice");
      if (!res.ok) {
        setReadNotice(`Could not read the file: ${result.error ?? "unknown error"} The file is attached — type the details below.`);
        return;
      }
      const x = (result.extracted ?? {}) as SupplierDoc;
      if (x.supplier_name) setSupplierName(x.supplier_name);
      if (x.invoice_number) setReferenceNo(x.invoice_number);
      if (x.invoice_date) setCostDate(x.invoice_date);
      if (typeof x.amount === "number") setAmount(String(x.amount));
      setReport(result.report ?? null);
      setReadNotice("These details were read from the document. Check every field below before saving; nothing is saved until you press the button.");
    } catch (err) {
      setReadNotice(err instanceof Error ? err.message : "Could not process the file.");
    } finally {
      setReading(false);
    }
  }

  function pickSupplierInvoice(id: string) {
    setSupplierInvoiceId(id);
    const s = supplierInvoices.find((x) => x.id === id);
    if (s) {
      setSupplierName(s.supplierName);
      setReferenceNo(s.invoice_number);
      setAmount(String(s.amount));
      setCostDate(s.invoice_date);
    }
  }

  async function submit(confirmDuplicate: boolean) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const base = { costClass, costType, costBasis, description, supplierName, referenceNo, quantity: num(quantity), unit, unitCost: num(unitCost), amount: Number(amount), costDate, paymentStatus, notes };
      if (entry) {
        await updateCostEntry(entry.id, { ...base, documentId });
        setOk("Cost updated.");
        onDone?.();
      } else {
        await addCostEntry({ eventId, ...base, supplierInvoiceId: supplierInvoiceId || undefined, documentId, confirmDuplicate });
        setOk(costBasis === "estimated" ? "Estimated cost recorded (not counted in the P&L)." : "Cost recorded.");
        setAmount(""); setDescription(""); setReferenceNo(""); setQuantity(""); setUnitCost(""); setNotes(""); setDocumentId(undefined); setFile(null); setReport(null); setReadNotice(null); setSupplierInvoiceId(""); setDuplicate(false);
      }
      router.refresh();
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not save.";
      if (m.includes(DUPLICATE_ENTRY_MESSAGE)) {
        setDuplicate(true);
        setError("A cost with the same type, supplier, reference, amount and date already exists for this event. Save anyway only if it is a genuinely separate cost.");
      } else setError(m);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!entry && (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-alt p-3">
          <div className="text-[12.5px] font-bold text-text">Supplier invoice / receipt (optional)</div>
          <p className="mt-0.5 text-[12px] text-text-secondary">Upload a PDF or photo and the system proposes the details for you to check, or key everything in below.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[12px]" />
            <button type="button" disabled={!file || reading} onClick={readDocument} className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{reading ? "Reading..." : "Upload & read"}</button>
          </div>
          {readNotice && <div className="mt-2 rounded-lg border border-[#CFE1F2] bg-info-bg px-3 py-2 text-[12.5px] text-[#0F3A63]">{readNotice}</div>}
          {report && <div className="mt-2"><ExtractionReportPanel report={report} /></div>}
          {supplierInvoices.length > 0 && (
            <div className="mt-3">
              <label className={label}>Or link an invoice already recorded in Supplier &amp; Procurement</label>
              <select value={supplierInvoiceId} onChange={(e) => pickSupplierInvoice(e.target.value)} className={input}>
                <option value="">— none —</option>
                {supplierInvoices.map((s) => <option key={s.id} value={s.id}>{s.supplierName} · {s.invoice_number} · RM {Number(s.amount).toFixed(2)}</option>)}
              </select>
              <p className="mt-1 text-[11.5px] text-text-muted">A supplier invoice can be the cost of one event only, once. Paying it later is not a second cost.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Cost kind *</label>
          <select value={costClass} onChange={(e) => changeClass(e.target.value as "direct" | "additional")} className={input}>
            <option value="direct">Direct cost</option>
            <option value="additional">Additional event-specific expense</option>
          </select>
        </div>
        <div>
          <label className={label}>Category *</label>
          <select value={costType} onChange={(e) => setCostType(e.target.value)} className={input}>
            {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Actual or estimated *</label>
          <select value={costBasis} onChange={(e) => setCostBasis(e.target.value as "actual" | "estimated")} className={input}>
            {Object.entries(COST_BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{k === "estimated" ? " (not counted in P&L)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Supplier</label>
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Invoice / receipt no.</label>
          <input value={referenceNo} onChange={(e) => { setReferenceNo(e.target.value); setDuplicate(false); }} className={input} />
        </div>
        <div>
          <label className={label}>Cost date *</label>
          <input type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Quantity</label>
          <input type="number" step="0.001" min="0" value={quantity} onChange={(e) => { setQuantity(e.target.value); recalc(e.target.value, unitCost); }} className={input} />
        </div>
        <div>
          <label className={label}>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, pax, trip..." className={input} />
        </div>
        <div>
          <label className={label}>Unit cost (RM)</label>
          <input type="number" step="0.0001" min="0" value={unitCost} onChange={(e) => { setUnitCost(e.target.value); recalc(quantity, e.target.value); }} className={input} />
        </div>
        <div>
          <label className={label}>Total cost (RM) *</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setDuplicate(false); }} className={input} />
        </div>
        <div>
          <label className={label}>Payment status</label>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as "unpaid" | "paid")} className={input}>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
        </div>
      </div>
      <div>
        <label className={label}>Remarks</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
      </div>
      <p className="text-[11.5px] text-text-muted">Payment status is for follow-up only: an unpaid supplier cost is still a cost of the event, and paying it later does not add another cost.</p>
      <Message error={error} ok={ok} />
      <div className="flex justify-end gap-2">
        {onDone && <button type="button" onClick={onDone} className="rounded-lg border border-border-strong px-4 py-2 text-[13px] font-semibold text-text">Cancel</button>}
        <button type="button" disabled={saving} onClick={() => submit(duplicate)} className={`rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60 ${duplicate ? "bg-danger" : "bg-primary"}`}>
          {saving ? "Saving..." : duplicate ? "Save anyway" : entry ? "Save changes" : "Add cost"}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------- edit / remove row

/** Edit-in-place and remove (with a reason, kept in the audit trail) for one revenue or cost entry. */
export function EntryActions({ kind, entry, eventId, companyId }: { kind: "revenue" | "cost"; entry: RevenueRowData | CostRowData; eventId: string; companyId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "remove">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "revenue") await deleteRevenueEntry(entry.id, reason);
      else await deleteCostEntry(entry.id, reason);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
      setBusy(false);
    }
  }

  if (mode === "edit") {
    return (
      <div className="mt-2 rounded-lg border border-border bg-surface-alt p-3">
        {kind === "revenue" ? <RevenueForm eventId={eventId} entry={entry as RevenueRowData} onDone={() => setMode("idle")} /> : <CostForm eventId={eventId} companyId={companyId} entry={entry as CostRowData} onDone={() => setMode("idle")} />}
      </div>
    );
  }
  if (mode === "remove") {
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3">
        <label className="text-[12px] font-semibold text-danger">Reason for removing (kept in the audit trail)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
        {error && <div className="text-[12px] text-danger">{error}</div>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || !reason.trim()} onClick={remove} className="rounded-lg bg-danger px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{busy ? "Removing..." : "Remove entry"}</button>
          <button type="button" onClick={() => setMode("idle")} className="rounded-lg border border-border-strong px-3 py-1.5 text-[12.5px] font-semibold text-text">Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <span className="flex gap-2 print:hidden">
      <button type="button" onClick={() => setMode("edit")} className="text-[12px] font-semibold text-primary hover:underline">Edit</button>
      <button type="button" onClick={() => setMode("remove")} className="text-[12px] font-semibold text-danger hover:underline">Remove</button>
    </span>
  );
}

// ------------------------------------------------------------------- budget

export function BudgetForm({ eventId, budget }: { eventId: string; budget: { budget_revenue: number | string | null; budget_direct_costs: number | string | null; budget_additional_costs: number | string | null; notes: string | null } | null }) {
  const router = useRouter();
  const [rev, setRev] = useState(budget?.budget_revenue != null ? String(budget.budget_revenue) : "");
  const [direct, setDirect] = useState(budget?.budget_direct_costs != null ? String(budget.budget_direct_costs) : "");
  const [additional, setAdditional] = useState(budget?.budget_additional_costs != null ? String(budget.budget_additional_costs) : "");
  const [notes, setNotes] = useState(budget?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await saveEventBudget({ eventId, budgetRevenue: num(rev), budgetDirectCosts: num(direct), budgetAdditionalCosts: num(additional), notes });
      setOk("Budget saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the budget.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={label}>Budget revenue (RM)</label><input type="number" step="0.01" min="0" value={rev} onChange={(e) => setRev(e.target.value)} className={input} /></div>
        <div><label className={label}>Budget direct costs (RM)</label><input type="number" step="0.01" min="0" value={direct} onChange={(e) => setDirect(e.target.value)} className={input} /></div>
        <div><label className={label}>Budget additional expenses (RM)</label><input type="number" step="0.01" min="0" value={additional} onChange={(e) => setAdditional(e.target.value)} className={input} /></div>
      </div>
      <div><label className={label}>Remarks</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} /></div>
      <p className="text-[11.5px] text-text-muted">Leave a figure empty if there is no budget for it: it then shows &ldquo;Budget not set&rdquo; and is never treated as zero. Budgets are never counted as costs.</p>
      <Message error={error} ok={ok} />
      <div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save budget"}</button></div>
    </div>
  );
}
