"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { createWastage, updateWastage } from "@/lib/kitchen/wastageActions";
import { WASTAGE_REASONS, WASTAGE_UNITS, type WastageRow } from "@/lib/kitchen/wastage";
import { uploadReceipt } from "@/lib/documents/upload";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { Select } from "@/components/ui/Select";
import { AREA, BTN, BTN_GHOST, ErrorLine, FIELD, LABEL } from "@/components/priority/ui";

/**
 * New entry / edit of the Wastage Log: what was thrown away, how much, why and (if known) what it was worth. Information only:
 * nothing is added to the costs or taken from the stock.
 */
export function WastageForm({
  companyId,
  today,
  items,
  editing,
  listHref,
}: {
  companyId: string;
  today: string;
  /** items typed before, offered in the Item box (anything new can be typed) */
  items: string[];
  editing?: WastageRow;
  listHref: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(editing?.wasted_on ?? today);
  const [item, setItem] = useState(editing?.item ?? "");
  const [quantity, setQuantity] = useState(editing ? String(Number(editing.quantity)) : "");
  const [unit, setUnit] = useState(editing?.unit ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [value, setValue] = useState(editing?.estimated_value === null || editing?.estimated_value === undefined ? "" : String(Number(editing.estimated_value)));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim()) return setError("Enter the item that was thrown away.");
    if (!(Number(quantity) > 0)) return setError("Enter a quantity more than 0.");
    if (!reason) return setError("Choose the reason.");
    setSaving(true);
    setError(null);
    try {
      const documentId = photo ? await uploadReceipt(companyId, photo) : (editing?.document_id ?? null);
      const input = {
        companyId,
        wastedOn: date,
        item,
        quantity: Number(quantity),
        unit,
        reason,
        estimatedValue: value.trim() === "" ? null : Number(value),
        notes,
        documentId,
      };
      const result = editing ? await updateWastage(editing.id, input) : await createWastage(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(listHref);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
      <ErrorLine message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="wastage-date">Date *</label>
          <input id="wastage-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="wastage-item">Item *</label>
          <SearchSelect id="wastage-item" value={item} onChange={setItem} options={items} placeholder="e.g. Ikan bakar, rice, sambal" className={FIELD} required maxLength={120} />
        </div>
        <div>
          <label className={LABEL} htmlFor="wastage-qty">Quantity *</label>
          <input id="wastage-qty" type="number" required min="0" step="any" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="wastage-unit">Unit</label>
          <SearchSelect id="wastage-unit" value={unit} onChange={setUnit} options={WASTAGE_UNITS} placeholder="kg, pcs, portion…" className={FIELD} maxLength={30} />
        </div>
        <div>
          <label className={LABEL}>Reason *</label>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} required className={FIELD}>
            <option value="">Select the reason</option>
            {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div>
          <label className={LABEL} htmlFor="wastage-value">Estimated value (RM)</label>
          <input id="wastage-value" type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Optional" className={FIELD} />
        </div>
      </div>
      <div>
        <label className={LABEL} htmlFor="wastage-notes">Notes</label>
        <textarea id="wastage-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: what happened" className={AREA} />
      </div>
      <div>
        <label className={LABEL} htmlFor="wastage-photo">Photo (optional)</label>
        <input id="wastage-photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-[13px]" />
        {editing?.document_id && (
          <p className="mt-1 text-[12.5px] text-text-secondary">
            {photo ? "The photo chosen here replaces the one saved." : <>A photo is saved with this entry. <DocumentViewLink documentId={editing.document_id} label="View photo" /></>}
          </p>
        )}
      </div>
      <p className="rounded-lg border border-border bg-surface-alt px-3.5 py-2.5 text-[13px] text-text-secondary">
        The Wastage Log is for information only. It is not added to any cost (the food bought is already counted in Company Expenses).
      </p>
      <div className="flex justify-end gap-2.5">
        <button type="button" className={BTN_GHOST} disabled={saving} onClick={() => router.push(listHref)}>Cancel</button>
        <button type="submit" className={BTN} disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Save Entry"}</button>
      </div>
    </form>
  );
}
