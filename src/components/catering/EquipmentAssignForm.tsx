"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEquipmentAssignment, createEquipment } from "@/lib/catering/actions";

type Equipment = { id: string; name: string; total_quantity: number; unit: string | null };

export function EquipmentAssignForm({ companyId, eventId, equipment }: { companyId: string; eventId: string; equipment: Equipment[] }) {
  const router = useRouter();
  const [creatingNew, setCreatingNew] = useState(equipment.length === 0);
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [quantityNeeded, setQuantityNeeded] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let targetId = equipmentId;
      if (creatingNew) {
        if (!newName.trim()) {
          setError("Enter an equipment name.");
          setSaving(false);
          return;
        }
        const created = await createEquipment({ companyId, name: newName, unit: newUnit || undefined, totalQuantity: Number(newQty) || 0 });
        targetId = created.id;
      }
      await addEquipmentAssignment({ companyId, eventId, equipmentId: targetId, quantityNeeded: Number(quantityNeeded) || 1 });
      router.refresh();
      setNewName("");
      setNewQty("1");
      setQuantityNeeded("1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}

      {!creatingNew && equipment.length > 0 && (
        <div className="flex items-end gap-2">
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className="h-9 flex-1 rounded-lg border border-border-strong px-2 text-[13px]">
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.name} ({eq.total_quantity} {eq.unit ?? ""} available)</option>
            ))}
          </select>
          <input type="number" min="0.5" step="0.5" value={quantityNeeded} onChange={(e) => setQuantityNeeded(e.target.value)} className="h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" placeholder="Qty" />
          <button type="submit" disabled={saving} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60">
            {saving ? "Adding..." : "+ Assign"}
          </button>
          <button type="button" onClick={() => setCreatingNew(true)} className="text-xs font-semibold text-primary">New type</button>
        </div>
      )}

      {creatingNew && (
        <div className="flex items-end gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Equipment name" className="h-9 flex-1 rounded-lg border border-border-strong px-2 text-[13px]" />
          <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Unit (pcs, sets)" className="h-9 w-28 rounded-lg border border-border-strong px-2 text-[13px]" />
          <input type="number" min="0" value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="Total owned" className="h-9 w-24 rounded-lg border border-border-strong px-2 text-[13px]" />
          <input type="number" min="0.5" step="0.5" value={quantityNeeded} onChange={(e) => setQuantityNeeded(e.target.value)} className="h-9 w-20 rounded-lg border border-border-strong px-2 text-[13px]" placeholder="Needed" />
          <button type="submit" disabled={saving} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60">
            {saving ? "Adding..." : "+ Add"}
          </button>
          {equipment.length > 0 && (
            <button type="button" onClick={() => setCreatingNew(false)} className="text-xs font-semibold text-text-secondary">Use existing</button>
          )}
        </div>
      )}
    </form>
  );
}
