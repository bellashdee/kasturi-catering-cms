"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseRequest, type PurchaseRequestInput } from "@/lib/kitchen/actions";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type Ingredient = { id: string; name: string; unit_of_measure: string | null; company_id: string; preferred_supplier_id: string | null };
type Supplier = { id: string; name: string; company_id: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function PurchaseRequestForm({
  companies,
  defaultCompanyId,
  ingredients,
  suppliers,
  defaultIngredientId,
  defaultQuantity,
  productionOrderId,
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  defaultIngredientId?: string;
  defaultQuantity?: string;
  productionOrderId?: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialIngredient = ingredients.find((i) => i.id === defaultIngredientId);
  const [companyId, setCompanyId] = useState(initialIngredient?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [ingredientId, setIngredientId] = useState(defaultIngredientId ?? "");
  const [supplierId, setSupplierId] = useState(initialIngredient?.preferred_supplier_id ?? "");
  const [quantity, setQuantity] = useState(defaultQuantity ?? "");
  const [unit, setUnit] = useState(initialIngredient?.unit_of_measure ?? "");
  const [requiredDate, setRequiredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const ingredientsForCompany = ingredients.filter((i) => i.company_id === companyId);
  const suppliersForCompany = suppliers.filter((s) => s.company_id === companyId);

  function onIngredientChange(id: string) {
    setIngredientId(id);
    const ing = ingredients.find((i) => i.id === id);
    setUnit(ing?.unit_of_measure ?? "");
    setSupplierId(ing?.preferred_supplier_id ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientId || !quantity) {
      setError("Ingredient and quantity are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let documentId: string | undefined;
      if (file) {
        const doc = await uploadDocument({ companyId, module: "kitchen", fileType: fileTypeFromMime(file), file });
        documentId = doc.id;
      }
      const payload: PurchaseRequestInput = {
        companyId,
        ingredientId,
        supplierId: supplierId || undefined,
        quantityRequested: Number(quantity),
        unit: unit || undefined,
        requiredDate: requiredDate || undefined,
        notes: notes || undefined,
        productionOrderId,
        documentId,
      };
      await createPurchaseRequest(payload);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div>
        <label className={labelClass}>Company *</label>
        <Select
          required
          value={companyId}
          onChange={(e) => { setCompanyId(e.target.value); onIngredientChange(""); }}
          className={inputClass}
        >
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <div>
        <label className={labelClass}>Ingredient *</label>
        <Select required value={ingredientId} onChange={(e) => onIngredientChange(e.target.value)} className={inputClass}>
          <option value="">Select ingredient</option>
          {ingredientsForCompany.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Quantity Requested *</label>
          <input type="number" min="0" step="0.01" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} placeholder="kg, l, pcs..." />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Supplier</label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">Not decided yet</option>
            {suppliersForCompany.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Required Date</label>
          <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes / Reason</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div>
        <label className={labelClass}>Supporting File (quote, reference photo, etc.) — optional</label>
        <input
          type="file"
          accept={ANY_UPLOAD_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm"
        />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Purchase Request"}
        </button>
      </div>
    </form>
  );
}
