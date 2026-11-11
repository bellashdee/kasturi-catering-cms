"use client";

import { todayInMalaysia } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCostEntriesByCategory,
  addCostEntry,
  addInvoiceAsRevenue,
  addRevenueEntry,
  deleteCostEntry,
  deleteRevenueEntry,
  saveEventBudget,
  updateCostEntry,
  updateRevenueEntry,
} from "@/lib/finance/eventPnlActions";
import { ADDITIONAL_COST_TYPE_LABEL, ANY_DIRECT_COST_TYPE_LABEL, COST_BASIS_LABEL, directCostOptions, DUPLICATE_ENTRY_MESSAGE, REVENUE_TYPE_LABEL, round2, suggestItemCostType } from "@/lib/finance/eventPnl";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { MultiChoiceSelect } from "@/components/ui/MultiChoiceSelect";
import { SplitAmountBox, SplitChoice } from "@/components/shared/SplitAmountBox";
import { splitAddsUp, splitCells } from "@/lib/categorySplit";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { requestExtraction } from "@/lib/importFlow/extractClient";
import type { ExtractionReport } from "@/lib/extraction/types";
import { ExtractionReportPanel } from "@/components/shared/import/ExtractionReportPanel";
import { DescriptionInput } from "@/components/DescriptionInput";
import { Select } from "@/components/ui/Select";
import { GoogleDrivePickButton } from "@/components/shared/GoogleDrivePickButton";

const input = "mt-1 h-10 w-full rounded-lg border border-border-strong px-3 text-[13px] outline-none focus:border-primary";
const label = "text-[12px] font-semibold text-text-secondary";
const todayIso = () => todayInMalaysia();
const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">
      Print
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
          <Select value={entryType} onChange={(e) => setEntryType(e.target.value)} disabled={!!entry?.customer_invoice_id} className={input}>
            <optgroup label="Revenue">{["sales", "package", "additional_service", "other_revenue"].map((k) => <option key={k} value={k}>{REVENUE_TYPE_LABEL[k]}</option>)}</optgroup>
            <optgroup label="Deducted from revenue">{["discount", "refund", "credit_note"].map((k) => <option key={k} value={k}>{REVENUE_TYPE_LABEL[k]}</option>)}</optgroup>
          </Select>
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
          <DescriptionInput value={description} onChange={setDescription} className={input} />
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

type InvoiceItem = { item_name: string; uom: string | null; quantity: number | null; line_total: number | null };
type SupplierInvoiceOption = { id: string; invoice_number: string; amount: number | string; invoice_date: string; supplierName: string; items?: InvoiceItem[] };

type SupplierDoc = {
  supplier_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  amount?: number | null;
  items?: { item_name?: string | null; uom?: string | null; quantity?: number | null; unit_price?: number | null; line_total?: number | null }[] | null;
};

/** One printed line of the invoice and the category it is counted under. */
type ItemLine = { name: string; quantity: number | null; uom: string | null; amount: number; costType: string };

function toItemLines(items: InvoiceItem[]): ItemLine[] {
  return items
    .filter((i) => i.item_name?.trim())
    .map((i) => ({ name: i.item_name.trim(), quantity: i.quantity, uom: i.uom, amount: Number(i.line_total ?? 0), costType: suggestItemCostType(i.item_name) }));
}

/**
 * The items of a supplier invoice, each with its category (proposed from its name, changed by the user), and the total of each category.
 * Saving records one direct cost per category; any difference to the printed invoice total (tax, discount, rounding) goes to the category chosen for it.
 */
function ItemsByCategory({
  lines,
  setLines,
  invoiceTotal,
  onSave,
  saving,
  onCancel,
}: {
  lines: ItemLine[];
  setLines: (lines: ItemLine[]) => void;
  invoiceTotal: number | null;
  onSave: (groups: { costType: string; amount: number; description: string }[]) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  const options = directCostOptions();
  const itemsTotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const difference = invoiceTotal === null ? 0 : round2(invoiceTotal - itemsTotal);
  const [differenceType, setDifferenceType] = useState("");

  const byType = new Map<string, { amount: number; names: string[] }>();
  for (const l of lines) {
    if (!l.costType) continue;
    const g = byType.get(l.costType) ?? { amount: 0, names: [] };
    g.amount += l.amount;
    g.names.push(l.name);
    byType.set(l.costType, g);
  }
  if (difference !== 0 && differenceType) {
    const g = byType.get(differenceType) ?? { amount: 0, names: [] };
    g.amount += difference;
    g.names.push(`difference to invoice total ${difference > 0 ? "+" : ""}${difference.toFixed(2)}`);
    byType.set(differenceType, g);
  }
  const groups = Array.from(byType.entries())
    .map(([costType, g]) => ({ costType, amount: round2(g.amount), description: g.names.join("; ").slice(0, 500) }))
    .sort((a, b) => (ANY_DIRECT_COST_TYPE_LABEL[a.costType] ?? "").localeCompare(ANY_DIRECT_COST_TYPE_LABEL[b.costType] ?? ""));
  const unassigned = lines.filter((l) => !l.costType).length;
  const ready = unassigned === 0 && (difference === 0 || !!differenceType) && groups.length > 0;
  const setType = (i: number, costType: string) => setLines(lines.map((l, j) => (j === i ? { ...l, costType } : l)));

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[12.5px] font-bold text-text">Items by category</div>
      <p className="mt-0.5 text-[12px] text-text-secondary">Each item has a proposed category. Check them (change any that is wrong); one cost is saved for each category with the total of its items.</p>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase text-text-muted">
            <tr><th className="py-1.5 pr-2">Item</th><th className="py-1.5 pr-2 text-right">Qty</th><th className="py-1.5 pr-2 text-right">Amount (RM)</th><th className="py-1.5">Category</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2 text-text">{l.name}</td>
                <td className="py-1.5 pr-2 text-right text-text-secondary">{l.quantity ?? "—"}{l.uom ? ` ${l.uom}` : ""}</td>
                <td className="py-1.5 pr-2 text-right font-semibold text-text">{l.amount.toFixed(2)}</td>
                <td className="py-1.5">
                  <Select value={l.costType} onChange={(e) => setType(i, e.target.value)} className={`h-8 w-full rounded-lg border px-2 text-[12.5px] ${l.costType ? "border-border-strong" : "border-danger"}`}>
                    <option value="">— choose —</option>
                    {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {difference !== 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warning-bg px-3 py-2 text-[12.5px] text-text">
          <span>The items add up to RM {itemsTotal.toFixed(2)}; the invoice total is RM {invoiceTotal?.toFixed(2)}. Count the difference (RM {difference.toFixed(2)}: tax, discount or rounding) under</span>
          <Select value={differenceType} onChange={(e) => setDifferenceType(e.target.value)} className="h-8 rounded-lg border border-border-strong px-2 text-[12.5px]">
            <option value="">— choose —</option>
            {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      )}
      {groups.length > 0 && (
        <div className="mt-2 divide-y divide-border rounded-lg border border-border">
          {groups.map((g) => (
            <div key={g.costType} className="flex justify-between px-3 py-1.5 text-[12.5px]">
              <span className="font-semibold text-text">{ANY_DIRECT_COST_TYPE_LABEL[g.costType]}</span>
              <span className="font-bold text-text">RM {g.amount.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between bg-surface-alt px-3 py-1.5 text-[12.5px]">
            <span className="font-semibold text-text-secondary">Total</span>
            <span className="font-bold text-text">RM {round2(groups.reduce((t, g) => t + g.amount, 0)).toFixed(2)}</span>
          </div>
        </div>
      )}
      {unassigned > 0 && <p className="mt-2 text-[12px] text-danger">{unassigned} item{unassigned > 1 ? "s have" : " has"} no category yet.</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">Record as one cost instead</button>
        <button type="button" disabled={!ready || saving} onClick={() => onSave(groups)} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
          {saving ? "Saving..." : `Add ${groups.length} cost${groups.length === 1 ? "" : "s"} by category`}
        </button>
      </div>
    </div>
  );
}

export function CostForm({ eventId, companyId, entry, supplierInvoices = [], onDone }: { eventId: string; companyId: string; entry?: CostRowData; supplierInvoices?: SupplierInvoiceOption[]; onDone?: () => void }) {
  const router = useRouter();
  const [costClass, setCostClass] = useState<"direct" | "additional">((entry?.cost_class as "direct" | "additional") ?? "direct");
  const [costType, setCostType] = useState(entry?.cost_type ?? "");
  // the category is chosen from the list (A to Z) or found by typing part of its name
  const [categoryText, setCategoryText] = useState(entry ? (ANY_DIRECT_COST_TYPE_LABEL[entry.cost_type] ?? ADDITIONAL_COST_TYPE_LABEL[entry.cost_type] ?? "") : "");
  const [costBasis, setCostBasis] = useState<"actual" | "estimated">((entry?.cost_basis as "actual" | "estimated") ?? "actual");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [supplierName, setSupplierName] = useState(entry?.supplier_name ?? "");
  const [referenceNo, setReferenceNo] = useState(entry?.reference_no ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [costDate, setCostDate] = useState(entry?.cost_date ?? todayIso());
  const [notes, setNotes] = useState(entry?.notes ?? "");
  // a new cost can be for more than one category: split the amount between them, or keep it as one cost
  const [cats, setCats] = useState<string[]>([]);
  const [splitOn, setSplitOn] = useState(true);
  const [shareText, setShareText] = useState<Record<string, string>>({});
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
  // the invoice's items with their categories, when the invoice is recorded by category (null: one cost, typed below)
  const [itemLines, setItemLines] = useState<ItemLine[] | null>(null);
  const [invoiceTotal, setInvoiceTotal] = useState<number | null>(null);
  const split = itemLines !== null;

  const typeOptions: [string, string][] = costClass === "direct" ? directCostOptions(entry?.cost_type) : Object.entries(ADDITIONAL_COST_TYPE_LABEL).sort((a, b) => a[1].localeCompare(b[1]));
  function changeCategoryText(text: string) {
    setCategoryText(text);
    const hit = typeOptions.find(([, label]) => label.toLowerCase() === text.trim().toLowerCase());
    setCostType(hit ? hit[0] : "");
  }
  function changeClass(next: "direct" | "additional") {
    setCostClass(next);
    setCostType("");
    setCategoryText("");
    setCats([]);
    setShareText({});
  }
  const catKey = (categoryLabel: string) => typeOptions.find(([, l]) => l === categoryLabel)?.[0] ?? "";
  const byCategory = !entry && !split && cats.length > 1 && splitOn;
  const cells = splitCells(amount, byCategory ? cats : [], [], shareText);

  /** Attach a supplier document: the existing reader proposes the fields, the user checks and edits before anything is saved. */
  async function readDocument() {
    if (!file) return;
    setReading(true);
    setError(null);
    setReadNotice(null);
    setReport(null);
    setItemLines(null);
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
      const items = (x.items ?? []).map((i) => ({ item_name: i.item_name ?? "", uom: i.uom ?? null, quantity: i.quantity ?? null, line_total: i.line_total ?? (i.quantity != null && i.unit_price != null ? round2(i.quantity * i.unit_price) : null) }));
      if (items.length > 0) {
        changeClass("direct");
        setItemLines(toItemLines(items));
        setInvoiceTotal(typeof x.amount === "number" ? x.amount : null);
      }
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
      if (s.items && s.items.length > 0) {
        changeClass("direct");
        setItemLines(toItemLines(s.items));
        setInvoiceTotal(Number(s.amount));
      } else setItemLines(null);
    } else setItemLines(null);
  }

  function resetAfterSave() {
    setAmount(""); setDescription(""); setReferenceNo(""); setCats([]); setShareText({}); setNotes(""); setDocumentId(undefined); setFile(null); setReport(null); setReadNotice(null); setSupplierInvoiceId(""); setDuplicate(false); setItemLines(null); setInvoiceTotal(null);
  }

  async function saveByCategory(groups: { costType: string; amount: number; description: string }[]) {
    setSaving(true);
    setError(null);
    setOk(null);
    const res = await addCostEntriesByCategory({ eventId, costBasis, supplierName, referenceNo, costDate, supplierInvoiceId: supplierInvoiceId || undefined, documentId, notes, groups });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOk(`${res.count} cost${res.count === 1 ? "" : "s"} recorded by category${costBasis === "estimated" ? " (estimated: not counted in the P&L)" : ""}.`);
    resetAfterSave();
    router.refresh();
  }

  async function submit(confirmDuplicate: boolean) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const base = { costClass, costType, costBasis, description, supplierName, referenceNo, amount: Number(amount), costDate, notes };
      if (entry) {
        if (!costType) throw new Error("Choose the category from the list.");
        await updateCostEntry(entry.id, { ...base, documentId });
        setOk("Cost updated.");
        onDone?.();
      } else {
        if (cats.length === 0) throw new Error("Choose at least one category.");
        const sorted = [...cats].sort((a, b) => a.localeCompare(b));
        if (byCategory) {
          if (!splitAddsUp(amount, cells) || cells.some((c) => c.amount <= 0)) throw new Error("The parts must add up to the total cost, each more than 0.");
          const res = await addCostEntriesByCategory({
            eventId, costClass, costBasis, supplierName, referenceNo, costDate, notes, documentId,
            supplierInvoiceId: supplierInvoiceId || undefined,
            groups: cells.map((c) => ({ costType: catKey(c.category), amount: c.amount, description })),
          });
          if (!res.ok) throw new Error(res.error);
          setOk(`${res.count} costs recorded, one for each category${costBasis === "estimated" ? " (estimated: not counted in the P&L)" : ""}.`);
        } else {
          // not split: one cost with the whole amount, counted under the first category (A to Z); the other categories are written in its description
          const written = sorted.length > 1 ? [description.trim(), `Categories: ${sorted.join(", ")}`].filter(Boolean).join(" · ") : description;
          await addCostEntry({ eventId, ...base, costType: catKey(sorted[0]), description: written, supplierInvoiceId: supplierInvoiceId || undefined, documentId, confirmDuplicate });
          setOk(costBasis === "estimated" ? "Estimated cost recorded (not counted in the P&L)." : "Cost recorded.");
        }
        resetAfterSave();
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
            <GoogleDrivePickButton accept={ANY_UPLOAD_ACCEPT} onPick={setFile} />
            {file && <span className="text-[12px] font-semibold text-text">{file.name}</span>}
            <button type="button" disabled={!file || reading} onClick={readDocument} className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">{reading ? "Reading..." : "Upload & read"}</button>
          </div>
          {readNotice && <div className="mt-2 rounded-lg border border-[#CFE1F2] bg-info-bg px-3 py-2 text-[12.5px] text-[#0F3A63]">{readNotice}</div>}
          {report && <div className="mt-2"><ExtractionReportPanel report={report} /></div>}
          {supplierInvoices.length > 0 && (
            <div className="mt-3">
              <label className={label}>Or link an invoice already recorded in Supplier &amp; Procurement</label>
              <Select value={supplierInvoiceId} onChange={(e) => pickSupplierInvoice(e.target.value)} className={input}>
                <option value="">— none —</option>
                {supplierInvoices.map((s) => <option key={s.id} value={s.id}>{s.supplierName} · {s.invoice_number} · RM {Number(s.amount).toFixed(2)}</option>)}
              </Select>
              <p className="mt-1 text-[11.5px] text-text-muted">A supplier invoice can be the cost of one event only, once. Paying it later is not a second cost.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {!split && (<>
        <div>
          <label className={label}>Cost kind *</label>
          <Select value={costClass} onChange={(e) => changeClass(e.target.value as "direct" | "additional")} className={input}>
            <option value="direct">Direct cost</option>
            <option value="additional">Additional event-specific expense</option>
          </Select>
        </div>
        <div>
          <label className={label}>{entry ? "Category *" : "Category (one or more) *"}</label>
          {entry ? (
            <>
              <SearchSelect value={categoryText} onChange={changeCategoryText} options={typeOptions.map(([, label]) => label)} placeholder="Choose or search a category" className={input} />
              {categoryText.trim() !== "" && costType === "" && <p className="mt-1 text-[11.5px] text-danger">Choose a category from the list.</p>}
            </>
          ) : (
            <MultiChoiceSelect options={typeOptions.map(([, label]) => label)} value={cats} onChange={(list) => { setCats(list); setShareText({}); }} placeholder="Select category" searchPlaceholder="Search category" />
          )}
        </div>
        </>)}
        <div>
          <label className={label}>Actual or estimated *</label>
          <Select value={costBasis} onChange={(e) => setCostBasis(e.target.value as "actual" | "estimated")} className={input}>
            {Object.entries(COST_BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{k === "estimated" ? " (not counted in P&L)" : ""}</option>)}
          </Select>
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
        {!split && (
        <div>
          <label className={label}>Total cost (RM) *</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setDuplicate(false); }} className={input} />
        </div>
        )}
        {!split && (
          <div>
            <label className={label}>Description</label>
            <DescriptionInput value={description} onChange={setDescription} companyId={companyId} className={input} />
          </div>
        )}
      </div>
      {!entry && !split && cats.length > 1 && (
        <SplitChoice
          label="Split the amount by category"
          checked={splitOn}
          onChange={(on) => { setSplitOn(on); setShareText({}); }}
          on="Each category gets its own part of the amount."
          off="Not split: one cost with the whole amount, counted under the first category (A to Z); the other categories are written in the description."
        />
      )}
      {byCategory && (
        <SplitAmountBox title="Split the amount by category (RM) *" total={amount} cells={cells} onType={(key, text) => setShareText((p) => ({ ...p, [key]: text }))} onEqual={() => setShareText({})} />
      )}
      <div>
        <label className={label}>Remarks</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
      </div>
      <Message error={error} ok={ok} />
      {split ? (
        <ItemsByCategory lines={itemLines} setLines={setItemLines} invoiceTotal={invoiceTotal} onSave={saveByCategory} saving={saving} onCancel={() => setItemLines(null)} />
      ) : (
        <div className="flex justify-end gap-2">
          {onDone && <button type="button" onClick={onDone} className="rounded-lg border border-border-strong px-4 py-2 text-[13px] font-semibold text-text">Cancel</button>}
          <button type="button" disabled={saving} onClick={() => submit(duplicate)} className={`rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60 ${duplicate ? "bg-danger" : "bg-primary"}`}>
            {saving ? "Saving..." : duplicate ? "Save anyway" : entry ? "Save changes" : "Add cost"}
          </button>
        </div>
      )}
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
