"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOption, setOptionActive } from "@/lib/restaurant/menuActions";
import type { MenuOption } from "@/lib/restaurant/menuData";
import { formatCurrency } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

/** Variants (a size, a cooking style) and add-ons (extra rice, a drink) of a menu item, each with its price change. An option is deactivated, never deleted. */
export function OptionsPanel({ companyId, menuItemId, options, canEdit, canPrice }: { companyId: string; menuItemId: string; options: MenuOption[]; canEdit: boolean; canPrice: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"variant" | "addon">("addon");
  const [name, setName] = useState("");
  const [delta, setDelta] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const r = await work();
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await run(() => saveOption({ companyId, menuItemId, kind, name, priceDelta: Number(delta || 0) }))) {
      setName("");
      setDelta("0");
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 text-[15px] font-bold text-text">Variants and add-ons</div>
      {error && <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {options.length === 0 ? (
        <div className="py-3 text-[13px] text-text-muted">No variant or add-on yet.</div>
      ) : (
        <table className="mb-4 w-full text-[13.5px]">
          <tbody>
            {options.map((o) => (
              <tr key={o.id} className={`border-b border-border last:border-0 ${o.is_active ? "" : "text-text-muted"}`}>
                <td className="py-2">{o.kind === "variant" ? "Variant" : "Add-on"}</td>
                <td className="py-2 font-semibold">{o.name}</td>
                <td className="py-2 text-right">{o.price_delta >= 0 ? "+" : ""}{formatCurrency(o.price_delta)}</td>
                <td className="py-2 text-right">{o.is_active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="neutral">Deactivated</StatusBadge>}</td>
                <td className="py-2 text-right">
                  {canEdit && <button type="button" disabled={busy} onClick={() => run(() => setOptionActive(o.id, !o.is_active))} className="text-[12.5px] font-semibold text-primary">{o.is_active ? "Deactivate" : "Activate"}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={SPEND_LABEL}>Type</label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as "variant" | "addon")} className={SPEND_INPUT}>
              <option value="addon">Add-on</option>
              <option value="variant">Variant</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className={SPEND_LABEL}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={SPEND_INPUT} required />
          </div>
          <div>
            <label className={SPEND_LABEL}>Price change (RM)</label>
            <input type="number" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} disabled={!canPrice} className={SPEND_INPUT} />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" disabled={busy} className={SPEND_SAVE_BTN}>{busy ? "Saving..." : "Add the option"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
