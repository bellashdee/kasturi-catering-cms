"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAccount, type AccountInput } from "@/lib/finance/paymentActions";
import {
  UTILITY_PROVIDERS,
  UTILITY_PROVIDER_BY_TYPE,
  UTILITY_TYPE_LABEL,
  accountDisplay,
  type PaymentCategory,
  type UtilityType,
} from "@/lib/finance/payments";

export type AccountRow = {
  id: string;
  companyId: string;
  companyName: string;
  category: PaymentCategory;
  name: string;
  provider: string | null;
  utilityType: UtilityType | null;
  bankName: string | null;
  accountNo: string | null;
  defaultDueDay: number | null;
  notes: string | null;
  isActive: boolean;
};

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]";
const labelClass = "text-[12px] font-semibold text-text-secondary";

type Draft = {
  id?: string;
  companyId: string;
  name: string;
  provider: string;
  utilityType: UtilityType | "";
  bankName: string;
  accountNo: string;
  defaultDueDay: string;
  notes: string;
  isActive: boolean;
};

function blank(companyId: string, category: PaymentCategory): Draft {
  return { companyId, name: "", provider: "", utilityType: "", bankName: "", accountNo: "", defaultDueDay: category === "rental" ? "7" : "", notes: "", isActive: true };
}

/** Reference list of suppliers, rental payees and utility accounts. Only Finance / Admin users reach this page; bank changes are audited. */
export function AccountsManager({ category, companies, accounts }: { category: PaymentCategory; companies: { id: string; name: string }[]; accounts: AccountRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(a: AccountRow) {
    setError(null);
    setDraft({
      id: a.id,
      companyId: a.companyId,
      name: a.name,
      provider: a.provider ?? "",
      utilityType: a.utilityType ?? "",
      bankName: a.bankName ?? "",
      accountNo: a.accountNo ?? "",
      defaultDueDay: a.defaultDueDay ? String(a.defaultDueDay) : "",
      notes: a.notes ?? "",
      isActive: a.isActive,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const input: AccountInput = {
        companyId: draft.companyId,
        category,
        name: draft.name,
        provider: category === "utility" ? draft.provider || (draft.utilityType ? UTILITY_PROVIDER_BY_TYPE[draft.utilityType] : undefined) : undefined,
        utilityType: category === "utility" && draft.utilityType ? draft.utilityType : undefined,
        bankName: draft.bankName || undefined,
        accountNo: draft.accountNo || undefined,
        defaultDueDay: draft.defaultDueDay ? Number(draft.defaultDueDay) : undefined,
        notes: draft.notes || undefined,
        isActive: draft.isActive,
      };
      await saveAccount(input, draft.id);
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const nameLabel = category === "utility" ? "Location / Account Name" : category === "rental" ? "Rental / Payee" : "Supplier Name";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => { setError(null); setDraft(blank(companies[0]?.id ?? "", category)); }} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
          + Add {category === "utility" ? "Utility Account" : category === "rental" ? "Rental Payee" : "Supplier"}
        </button>
      </div>

      {draft && (
        <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
          {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Company</label>
              <select value={draft.companyId} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, companyId: e.target.value })} className={inputClass}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>{nameLabel} *</label>
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
            </div>
          </div>
          {category === "utility" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Utility Type</label>
                <select value={draft.utilityType} onChange={(e) => setDraft({ ...draft, utilityType: e.target.value as UtilityType | "", provider: e.target.value ? UTILITY_PROVIDER_BY_TYPE[e.target.value as UtilityType] : draft.provider })} className={inputClass}>
                  <option value="">Select type</option>
                  {(Object.keys(UTILITY_TYPE_LABEL) as UtilityType[]).map((t) => <option key={t} value={t}>{UTILITY_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Utility Provider</label>
                <select value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} className={inputClass}>
                  <option value="">Select provider</option>
                  {UTILITY_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Bank Name</label>
              <input value={draft.bankName} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{category === "utility" ? "Account No." : "Bank Account Number"}</label>
              <input value={draft.accountNo} onChange={(e) => setDraft({ ...draft, accountNo: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Default due day of month</label>
              <input type="number" min="1" max="31" value={draft.defaultDueDay} onChange={(e) => setDraft({ ...draft, defaultDueDay: e.target.value })} className={inputClass} placeholder="e.g. 7" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputClass} />
          </div>
          {draft.id && (
            <label className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active (inactive accounts are hidden from the payment forms; nothing is deleted)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border-strong px-4 py-2 text-[13px] font-semibold text-text">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5">{nameLabel}</th>
              {category === "utility" && <th className="px-4 py-2.5">Provider</th>}
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Account No.</th>
              <th className="px-4 py-2.5">Company</th>
              <th className="px-4 py-2.5">Due day</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-text-muted">No accounts yet.</td></tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className={`border-b border-border last:border-0 ${a.isActive ? "" : "opacity-50"}`}>
                <td className="px-4 py-2.5 font-semibold text-text">{a.name}{a.utilityType ? <span className="ml-2 text-[11px] font-normal text-text-muted">{UTILITY_TYPE_LABEL[a.utilityType].replace("Utility – ", "")}</span> : null}</td>
                {category === "utility" && <td className="px-4 py-2.5">{a.provider ?? "—"}</td>}
                <td className="px-4 py-2.5">{a.bankName ?? "—"}</td>
                <td className="px-4 py-2.5">{accountDisplay(a.accountNo)}</td>
                <td className="px-4 py-2.5">{a.companyName}</td>
                <td className="px-4 py-2.5">{a.defaultDueDay ?? "—"}</td>
                <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => edit(a)} className="text-[12.5px] font-semibold text-primary">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
