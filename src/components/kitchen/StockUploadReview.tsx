"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { recordStockMovement, findDuplicateStockInvoice } from "@/lib/kitchen/actions";
import { MOVEMENT_TYPE_LABEL } from "@/lib/kitchen/constants";
import { requestExtraction } from "@/lib/importFlow/extractClient";
import { Select } from "@/components/ui/Select";

type Tab = "manual" | "count" | "supplier_invoice" | "customer_invoice";
type Company = { id: string; name: string };
type Ingredient = { id: string; name: string; unit_of_measure: string | null; company_id: string };
type CateringEvent = { id: string; event_name: string; event_date: string; company_id: string };
type MovementType = "in" | "out" | "adjustment" | "wastage";

type Row = {
  ocrName: string;
  ingredientId: string;
  quantity: string;
  unit: string;
};

type ExtractedItem = { ingredient_name?: string; quantity?: number; unit?: string };
type Extracted = {
  items?: ExtractedItem[];
  supplier_name?: string | null;
  customer_name?: string | null;
  event_name?: string | null;
  invoice_number?: string | null;
};

const TAB_LABEL: Record<Tab, string> = {
  manual: "Manual Entry",
  count: "Stock Count",
  supplier_invoice: "Stock In — Supplier Invoice",
  customer_invoice: "Stock Out — Customer Event Invoice",
};

const EXTRACTION_KIND: Record<Exclude<Tab, "manual">, string> = {
  count: "stock_count",
  supplier_invoice: "purchase_receipt",
  customer_invoice: "customer_event_invoice",
};

const DEFAULT_MOVEMENT: Record<Tab, MovementType> = {
  manual: "in",
  count: "adjustment",
  supplier_invoice: "in",
  customer_invoice: "out",
};

const PICK_PROMPT: Record<Exclude<Tab, "manual">, string> = {
  count: "Click to choose your stock count (photo, screenshot, PDF or Excel)",
  supplier_invoice: "Click to choose the supplier invoice / delivery order (PDF, Excel, CSV, screenshot or photo)",
  customer_invoice: "Click to choose the customer event invoice (PDF, Excel, CSV, screenshot or photo)",
};

function matchIngredient(name: string, options: Ingredient[]): string {
  const lower = name.trim().toLowerCase();
  if (!lower) return "";
  const exact = options.find((o) => o.name.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = options.find((o) => o.name.toLowerCase().includes(lower) || lower.includes(o.name.toLowerCase()));
  return partial?.id ?? "";
}

function emptyRow(): Row {
  return { ocrName: "", ingredientId: "", quantity: "", unit: "" };
}

const inputClass = "mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";
const cellClass = "w-full rounded border border-border-strong px-2 py-1 text-[12.5px] outline-none focus:border-primary";

export function StockUploadReview({
  companies,
  defaultCompanyId,
  ingredients,
  events,
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  ingredients: Ingredient[];
  events: CateringEvent[];
  redirectTo: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");
  const [step, setStep] = useState<"pick" | "review">("review");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [movementType, setMovementType] = useState<MovementType>("in");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [party, setParty] = useState("");
  const [eventId, setEventId] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  const ingredientsForCompany = ingredients.filter((i) => i.company_id === companyId);
  const eventsForCompany = events.filter((e) => e.company_id === companyId);
  const isInvoiceTab = tab === "supplier_invoice" || tab === "customer_invoice";

  function selectTab(next: Tab) {
    setTab(next);
    setFile(null);
    setDocumentId(null);
    setNotice(null);
    setError(null);
    setRows([emptyRow()]);
    setInvoiceNumber("");
    setParty("");
    setEventId("");
    setDuplicateWarning(false);
    setMovementType(DEFAULT_MOVEMENT[next]);
    setStep(next === "manual" ? "review" : "pick");
  }

  async function handleUploadAndExtract() {
    if (!file || tab === "manual") return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument({ companyId, module: "kitchen", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);

      const { res, result } = await requestExtraction(doc.id, EXTRACTION_KIND[tab]);

      if (!res.ok) {
        setNotice(`Extraction failed (${result.error ?? "unknown error"}) — the file is saved, please add rows manually below.`);
      } else if (result.configured === false) {
        setNotice(result.message);
      } else {
        const extracted: Extracted = result.extracted ?? {};
        const items = extracted.items ?? [];
        setInvoiceNumber(extracted.invoice_number ?? "");
        setParty((tab === "supplier_invoice" ? extracted.supplier_name : extracted.customer_name) ?? "");
        if (tab === "customer_invoice" && extracted.event_name) {
          const name = extracted.event_name.trim().toLowerCase();
          const match = eventsForCompany.find((e) => e.event_name.toLowerCase().includes(name) || name.includes(e.event_name.toLowerCase()));
          if (match) setEventId(match.id);
        }
        if (items.length === 0) {
          setNotice("Couldn't find any line items in that file — add rows manually below.");
        } else {
          setRows(
            items.map((item) => ({
              ocrName: item.ingredient_name ?? "",
              ingredientId: matchIngredient(item.ingredient_name ?? "", ingredientsForCompany),
              quantity: item.quantity != null ? String(item.quantity) : "",
              unit: item.unit ?? "",
            })),
          );
          setNotice(
            "This information was extracted automatically. Match each row to the right ingredient and check the quantities. Nothing is saved to stock until you press Confirm.",
          );
        }
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm(skipDuplicateCheck = false) {
    const valid = rows.filter((r) => r.ingredientId && Number(r.quantity) > 0);
    if (valid.length === 0) {
      setError("Add at least one row with an ingredient and quantity.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isInvoiceTab && invoiceNumber.trim() && !skipDuplicateCheck) {
        const duplicate = await findDuplicateStockInvoice({
          companyId,
          invoiceNumber,
          movementType: tab === "supplier_invoice" ? "in" : "out",
        });
        if (duplicate) {
          setDuplicateWarning(true);
          setSaving(false);
          return;
        }
      }

      const invoiceNote = isInvoiceTab && invoiceNumber.trim() ? `Invoice ${invoiceNumber.trim()}` : null;
      let first = true;
      for (const row of valid) {
        const matchedName = ingredientsForCompany.find((i) => i.id === row.ingredientId)?.name;
        const note = [invoiceNote, party.trim() || null, row.ocrName && row.ocrName !== matchedName ? `As written: ${row.ocrName}` : null]
          .filter(Boolean)
          .join(" · ");
        await recordStockMovement({
          companyId,
          ingredientId: row.ingredientId,
          movementType,
          quantity: Number(row.quantity),
          notes: note || undefined,
          documentId: first ? documentId ?? undefined : undefined,
          referenceType: tab === "customer_invoice" && eventId ? "catering_event" : tab === "supplier_invoice" ? "supplier_invoice_upload" : undefined,
          referenceId: tab === "customer_invoice" && eventId ? eventId : undefined,
        });
        first = false;
      }
      setResult(valid.length);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (result !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-bg">
          <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10l4 4 8-8" />
          </svg>
        </div>
        <div className="text-lg font-bold text-text">{result} stock movement{result === 1 ? "" : "s"} recorded</div>
        <button onClick={() => router.push(redirectTo)} className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white">
          Back to Stock
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap border-b border-border px-5">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`border-b-2 px-4 py-3.5 text-[13.5px] font-bold ${tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="p-6">
        <div className="mb-4">
          <label className={labelClass}>Company *</label>
          <Select
            required
            disabled={documentId !== null}
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setRows([emptyRow()]); setEventId(""); }}
            className={`${inputClass} disabled:bg-surface-alt disabled:text-text-muted`}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>

        {step === "pick" && tab !== "manual" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <label className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 18a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6-2A4.5 4.5 0 0 1 17 18H7z" />
                <path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" />
              </svg>
              <span className="px-4 text-[14px] font-bold text-text">{file ? file.name : PICK_PROMPT[tab]}</span>
              <input type="file" accept={ANY_UPLOAD_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {error && <div className="text-sm text-danger">{error}</div>}
            <button onClick={handleUploadAndExtract} disabled={!file || uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {uploading ? "Uploading & reading document..." : "Upload & Extract"}
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            {notice && (
              <div className="flex items-start gap-2 rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" className="mt-0.5 shrink-0">
                  <circle cx="10" cy="10" r="7.2" />
                  <line x1="10" y1="9" x2="10" y2="14" />
                </svg>
                <span>{notice}</span>
              </div>
            )}
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}
            {duplicateWarning && (
              <div className="rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-3 text-[13px] text-warning">
                Invoice <b>{invoiceNumber}</b> has already been recorded for this company. Saving again would count the same stock twice.
                <div className="mt-2 flex gap-2">
                  <button onClick={() => { setDuplicateWarning(false); handleConfirm(true); }} className="rounded-lg bg-warning px-3 py-1.5 text-xs font-bold text-white">
                    Save anyway
                  </button>
                  <button onClick={() => setDuplicateWarning(false)} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-bold text-text">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isInvoiceTab && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Invoice Number</label>
                  <input value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); setDuplicateWarning(false); }} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{tab === "supplier_invoice" ? "Supplier" : "Customer"}</label>
                  <input value={party} onChange={(e) => setParty(e.target.value)} className={inputClass} />
                </div>
                {tab === "customer_invoice" && (
                  <div>
                    <label className={labelClass}>Catering Event</label>
                    <Select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
                      <option value="">Not linked</option>
                      {eventsForCompany.map((ev) => <option key={ev.id} value={ev.id}>{ev.event_name} ({ev.event_date})</option>)}
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>This batch should be recorded as</label>
              <Select value={movementType} onChange={(e) => setMovementType(e.target.value as MovementType)} className={inputClass}>
                <option value="in">{MOVEMENT_TYPE_LABEL.in} (received from supplier)</option>
                <option value="adjustment">{MOVEMENT_TYPE_LABEL.adjustment} (physical stock count)</option>
                <option value="wastage">{MOVEMENT_TYPE_LABEL.wastage} (spoiled / thrown out)</option>
                <option value="out">{MOVEMENT_TYPE_LABEL.out} (used / removed)</option>
              </Select>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface-alt">
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-2">As Read</th>
                    <th className="px-3 py-2">Match to Ingredient *</th>
                    <th className="px-3 py-2">Quantity *</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-t border-border ${row.ocrName && !row.ingredientId ? "bg-warning-bg/40" : ""}`}>
                      <td className="px-3 py-1.5 text-[12.5px] text-text-muted">{row.ocrName || "—"}</td>
                      <td className="px-3 py-1.5">
                        <Select value={row.ingredientId} onChange={(e) => updateRow(i, "ingredientId", e.target.value)} className={cellClass}>
                          <option value="">{row.ocrName ? "Needs your confirmation — select ingredient" : "Select ingredient"}</option>
                          {ingredientsForCompany.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                        </Select>
                      </td>
                      <td className="px-3 py-1.5"><input className={cellClass} value={row.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} /></td>
                      <td className="px-3 py-1.5"><input className={cellClass} value={row.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} /></td>
                      <td className="px-3 py-1.5"><button onClick={() => removeRow(i)} className="text-xs font-semibold text-danger">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setRows((prev) => [...prev, emptyRow()])} className="self-start text-[12.5px] font-semibold text-primary">
              + Add Row
            </button>
            <p className="text-xs text-text-muted">Rows left without an ingredient are not saved. Stock only changes after you press Confirm &amp; Save.</p>

            <div className="mt-2 flex justify-end gap-2.5">
              <button type="button" onClick={() => router.push(redirectTo)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
                Cancel
              </button>
              <button onClick={() => handleConfirm()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10l4 4 8-8" />
                </svg>
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
