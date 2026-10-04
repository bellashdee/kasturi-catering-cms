"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { createPettyCashTransaction } from "@/lib/finance/actions";

type Company = { id: string; name: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PettyCashForm({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [type, setType] = useState<"top_up" | "expense">("expense");
  const [claimantName, setClaimantName] = useState("");
  const [claimantDepartment, setClaimantDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClaim = type === "expense";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) {
      setError("Amount is required.");
      return;
    }
    if (isClaim && !claimantName.trim()) {
      setError("Enter who is claiming this petty cash.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let documentId: string | undefined;
      if (receipt) {
        const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(receipt), file: receipt });
        documentId = doc.id;
      }
      await createPettyCashTransaction({
        companyId,
        type,
        claimantName: isClaim ? claimantName.trim() : undefined,
        claimantDepartment: isClaim ? claimantDepartment.trim() || undefined : undefined,
        category: category || undefined,
        description: description || undefined,
        amount: Number(amount),
        transactionDate,
        documentId,
      });
      setClaimantName("");
      setClaimantDepartment("");
      setCategory("");
      setDescription("");
      setAmount("");
      setReceipt(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Company *</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Type *</label>
          <select value={type} onChange={(e) => setType(e.target.value as "top_up" | "expense")} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="expense">Claim (deduct — needs payment)</option>
            <option value="top_up">Top-Up (add to float)</option>
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">{isClaim ? "Claim Date *" : "Date *"}</label>
          <input type="date" required value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Amount (RM) *</label>
          <input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
      </div>

      {isClaim && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Claimant / Requested By *</label>
            <input
              value={claimantName}
              onChange={(e) => setClaimantName(e.target.value)}
              placeholder="Type the staff member's name"
              className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">Department</label>
            <input
              value={claimantDepartment}
              onChange={(e) => setClaimantDepartment(e.target.value)}
              placeholder="e.g. Kitchen, Sales"
              className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" placeholder="e.g. Stationery, Postage" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">{isClaim ? "Purpose / Description" : "Description"}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" placeholder={isClaim ? "e.g. Seafood purchase for event" : undefined} />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Supporting Receipt / Document {isClaim ? "" : "(optional)"}</label>
        <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : isClaim ? "Submit Claim" : "Record Top-Up"}
        </button>
      </div>
    </form>
  );
}
