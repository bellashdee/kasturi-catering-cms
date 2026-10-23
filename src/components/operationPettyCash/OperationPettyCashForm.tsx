"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { errorMessage } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import { createPettyCashEntry, updatePettyCashEntry } from "@/lib/operationPettyCash/actions";
import { PETTY_CASH_CATEGORIES, type EntryType, type OperationPettyCashRow } from "@/lib/operationPettyCash/constants";
import { DescriptionInput } from "@/components/DescriptionInput";

type Company = { id: string; name: string };

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/** Record money received (top-up) or spent (with the receipt); also used to edit an entry. */
export function OperationPettyCashForm({ companies, defaultCompanyId, editing, listHref }: { companies: Company[]; defaultCompanyId?: string; editing?: OperationPettyCashRow; listHref: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(editing?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [type, setType] = useState<EntryType>(editing?.entry_type ?? "expense");
  const [date, setDate] = useState(editing?.entry_date ?? todayInMalaysia());
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSpent = type === "expense";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let documentId: string | undefined;
      if (receipt) {
        const doc = await uploadDocument({ companyId, module: "driver-logistics", fileType: fileTypeFromMime(receipt), file: receipt, skipMarkdown: true });
        documentId = doc.id;
      }
      const input = { companyId, entryType: type, entryDate: date, category: category || undefined, description: description || undefined, amount: Number(amount), documentId };
      const result = editing ? await updatePettyCashEntry(editing.id, input) : await createPettyCashEntry(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing) {
        router.push(listHref);
      } else {
        setAmount("");
        setCategory("");
        setDescription("");
        setReceipt(null);
        (e.target as HTMLFormElement).reset();
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-[15px] font-bold text-text">{editing ? "Edit entry" : "New entry"}</div>
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Company *</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Type *</label>
          <select value={type} onChange={(e) => setType(e.target.value as EntryType)} className={inputClass}>
            <option value="expense">Spent</option>
            <option value="top_up">Received (top-up)</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required max={todayInMalaysia()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount (RM) *</label>
          <input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isSpent && (
          <div>
            <label className={labelClass}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option value="">Select category</option>
              {PETTY_CASH_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
        <div className={isSpent ? "" : "sm:col-span-2"}>
          <label className={labelClass}>{isSpent ? "What was it spent on?" : "Description (e.g. who gave the money)"}</label>
          <DescriptionInput value={description} onChange={setDescription} companyId={companyId} className={inputClass} placeholder={isSpent ? "e.g. Petrol for event delivery" : "e.g. Float from Ms. Penny"} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Receipt / photo {isSpent ? "(keep it with the record)" : "(optional)"}</label>
        <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
        {editing?.document_id && !receipt && <p className="mt-1 text-[11.5px] text-text-muted">A receipt is already attached. Choose a file only to replace it.</p>}
      </div>

      <div className="flex justify-end gap-2.5">
        {editing && (
          <Link href={listHref} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Cancel
          </Link>
        )}
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : editing ? "Save changes" : isSpent ? "Save spending" : "Save top-up"}
        </button>
      </div>
    </form>
  );
}
