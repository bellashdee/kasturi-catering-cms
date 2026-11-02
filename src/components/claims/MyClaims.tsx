"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { deleteMyClaim, restoreMyClaim, submitMyClaim, updateMyClaim, type MyClaimInput } from "@/lib/finance/myClaims";
import type { PettyCashTransactionRow } from "@/lib/finance/actions";
import { PAYMENT_METHOD_LABEL, PETTY_CASH_CATEGORIES, joinCategories, splitCategories } from "@/lib/operationPettyCash/constants";
import { DescriptionInput } from "@/components/DescriptionInput";
import { Select } from "@/components/ui/Select";
import { MultiChoiceSelect } from "@/components/ui/MultiChoiceSelect";
import { SplitAmountBox } from "@/components/shared/SplitAmountBox";
import { chosenCategories, splitAddsUp, splitCells } from "@/lib/categorySplit";
import { RecordActions } from "@/components/shared/RecordActions";
import { BTN_GHOST, Dialog } from "@/components/priority/ui";
import { CompanyChips } from "@/components/pettyCash/CompanyChips";

type Company = { id: string; name: string };
type Payer = { name: string; position: string };
export type ClaimValues = { companyId: string; date: string; amount: string; payer: string; paymentMethod: string; category: string; description: string };

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/** The fields of a claim: used to send a new claim and to change one that is not paid yet. */
function ClaimFields({
  companies,
  payers,
  initial,
  hasReceipt = false,
  multiCompany = false,
  submitLabel,
  onSubmit,
  onCancel,
  onSaved,
  clearAfter = false,
}: {
  companies: Company[];
  payers: Payer[];
  initial: ClaimValues;
  hasReceipt?: boolean;
  /** a new claim: one or more companies, the amount split between them (each part is its own claim) */
  multiCompany?: boolean;
  submitLabel: string;
  onSubmit: (input: MyClaimInput) => Promise<ActionResult>;
  onCancel?: () => void;
  onSaved: () => void;
  /** a new claim: the boxes are emptied after it is sent */
  clearAfter?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ClaimValues>) => setV((p) => ({ ...p, ...patch }));
  // the companies the bill is for (a new claim can be for more than one)
  const [companyIds, setCompanyIds] = useState<string[]>(initial.companyId ? [initial.companyId] : []);
  const chosenCompanies = companies.filter((c) => companyIds.includes(c.id));
  const companyId = multiCompany ? (chosenCompanies[0]?.id ?? "") : v.companyId;
  // more than one company or category: the amount is split between them, each part is its own claim
  const [shareText, setShareText] = useState<Record<string, string>>({});
  const categoryList = chosenCategories(splitCategories(v.category));
  const byCategory = categoryList.length > 1;
  const byCompany = multiCompany && chosenCompanies.length > 1;
  const cells = splitCells(v.amount, byCategory ? categoryList : [], byCompany ? chosenCompanies.map((c) => c.id) : [], shareText);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!companyId) {
      setError("Choose the company the bill is for.");
      return;
    }
    if (!v.payer) {
      setError("Choose who you claim from: Penny Chan or Nabilah.");
      return;
    }
    if (!v.paymentMethod) {
      setError("Choose how you paid: cash or online transfer.");
      return;
    }
    if ((byCategory || byCompany) && (!splitAddsUp(v.amount, cells) || cells.some((c) => c.amount <= 0))) {
      setError("The parts must add up to the amount you paid, each more than 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let documentId: string | undefined;
      if (receipt) {
        const doc = await uploadDocument({ companyId, module: "finance", fileType: fileTypeFromMime(receipt), file: receipt, skipMarkdown: true });
        documentId = doc.id;
      }
      const result = await onSubmit({
        companyId,
        date: v.date,
        amount: Number(v.amount),
        payer: v.payer,
        paymentMethod: v.paymentMethod,
        category: v.category || undefined,
        description: v.description || undefined,
        documentId,
        // split between companies (and categories): each part with its company; only categories: each part with its category
        shares: byCompany ? cells.map((c) => ({ companyId: c.companyId, amount: c.amount, ...(byCategory ? { category: c.category } : {}) })) : undefined,
        categoryShares: byCategory && !byCompany ? cells.map((c) => ({ category: c.category, amount: c.amount })) : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReceipt(null);
      form.reset();
      if (clearAfter) {
        setV(initial);
        setCompanyIds([]);
        setShareText({});
      }
      onSaved();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not send the claim."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>{multiCompany ? "Company the bill is for * (choose one or more)" : "Company the bill is for *"}</label>
          {multiCompany ? (
            <CompanyChips companies={companies} value={companyIds} onChange={(ids) => { setCompanyIds(ids); setShareText({}); }} />
          ) : (
            <Select value={v.companyId} onChange={(e) => set({ companyId: e.target.value })} required className={inputClass}>
              <option value="">Select the company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </div>
        <div>
          <label className={labelClass}>Date you bought it *</label>
          <input type="date" required max={todayInMalaysia()} value={v.date} onChange={(e) => set({ date: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Amount you paid (RM) *</label>
          <input type="number" min="0.01" step="0.01" required value={v.amount} onChange={(e) => { set({ amount: e.target.value }); setShareText({}); }} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>You paid by *</label>
          <Select value={v.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })} required className={inputClass}>
            <option value="">Select cash or online transfer</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Claim from *</label>
          <Select value={v.payer} onChange={(e) => set({ payer: e.target.value })} required className={inputClass}>
            <option value="">Select Penny Chan or Nabilah</option>
            {payers.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Category (choose one or more)</label>
          <MultiChoiceSelect options={PETTY_CASH_CATEGORIES} value={splitCategories(v.category)} onChange={(list) => set({ category: joinCategories(list) })} placeholder="Select category" searchPlaceholder="Search category" />
        </div>
      </div>
      <div>
        <label className={labelClass}>What did you buy?</label>
        <DescriptionInput value={v.description} onChange={(text) => set({ description: text })} companyId={v.companyId} className={inputClass} placeholder="e.g. Cooking gas for the Ahmad wedding" />
      </div>
      {(byCategory || byCompany) && (
        <SplitAmountBox
          title={byCategory && byCompany ? "Split the amount by category and company (RM) *" : byCompany ? "Split the amount between the companies (RM) *" : "Split the amount by category (RM) *"}
          total={v.amount}
          cells={cells}
          companies={byCompany ? chosenCompanies : []}
          onType={(key, text) => setShareText((p) => ({ ...p, [key]: text }))}
          onEqual={() => setShareText({})}
        />
      )}
      <div>
        <label className={labelClass}>Receipt / photo of the receipt</label>
        <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
        {hasReceipt && !receipt && <p className="mt-1 text-[11.5px] text-text-muted">A receipt is already attached. Choose a file only to replace it.</p>}
      </div>
      <div className="flex justify-end gap-2.5">
        {onCancel && (
          <button type="button" className={BTN_GHOST} disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** The form that sends a new claim. */
export function MyClaimForm({ companies, payers }: { companies: Company[]; payers: Payer[] }) {
  return (
    <ClaimFields
      companies={companies}
      payers={payers}
      initial={{ companyId: "", date: todayInMalaysia(), amount: "", payer: payers.length === 1 ? payers[0].name : "", paymentMethod: "", category: "", description: "" }}
      multiCompany
      submitLabel="Send claim"
      onSubmit={submitMyClaim}
      onSaved={() => undefined}
      clearAfter
    />
  );
}

export type MyClaimEditData = ClaimValues & { id: string; amountText: string; hasReceipt: boolean };

/** Edit (Save / Cancel) and Delete (Undo) of a claim that is not paid yet. */
export function MyClaimActions({ claim, companies, payers }: { claim: MyClaimEditData; companies: Company[]; payers: Payer[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RecordActions<PettyCashTransactionRow>
        onEdit={() => setOpen(true)}
        onDelete={() => deleteMyClaim(claim.id)}
        onRestore={(row) => restoreMyClaim(row)}
        confirmText={`Delete this claim of RM ${claim.amountText}?`}
      />
      {open && (
        <Dialog title="Edit claim" onClose={() => setOpen(false)}>
          <ClaimFields
            companies={companies}
            payers={payers}
            initial={claim}
            hasReceipt={claim.hasReceipt}
            submitLabel="Save changes"
            onSubmit={(input) => updateMyClaim(claim.id, input)}
            onCancel={() => setOpen(false)}
            onSaved={() => setOpen(false)}
          />
        </Dialog>
      )}
    </>
  );
}

